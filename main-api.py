"""
Mandala Backend API Engine (FastAPI)
Entry point for AMD ROCm & Triton LLM Studio backend.
Exposes WebSocket telemetry, dynamic Triton compilation, and AI Copilot endpoints.
"""
import asyncio
import json
import subprocess
from typing import Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.telemetry import parse_rocm_smi
from backend.triton_compiler import compile_and_execute_kernel
from backend.copilot_agent import create_pydantic_ai_agent, fallback_copilot_diagnosis

try:
    from backend.telemetry import parse_rocm_smi
except ImportError:
    parse_rocm_smi = None


app = FastAPI(
    title="Mandala - AMD ROCm & Triton API Engine",
    description="Low-code API engine to compile Triton kernels and stream ROCm/CUDA hardware telemetry",
    version="1.0.0"
)

# Enable CORS for local Next.js / Vite client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Pydantic AI agent if available
copilot_agent = create_pydantic_ai_agent()


class CompileRunRequest(BaseModel):
    kernel_type: str = Field(default="gemm", description="gemm, flash_attention, rmsnorm, softmax, vector_add, custom")
    M: int = Field(default=2048)
    N: int = Field(default=2048)
    K: int = Field(default=2048)
    block_size_m: int = Field(default=128)
    block_size_n: int = Field(default=64)
    block_size_k: int = Field(default=64)
    num_warps: int = Field(default=8)
    num_stages: int = Field(default=2)
    dtype: str = Field(default="bfloat16")
    target_arch: str = Field(default="gfx942", description="gfx942 (MI300X), gfx90a (MI250X), gfx1100")
    custom_code: Optional[str] = None


class CopilotChatRequest(BaseModel):
    message: str
    conversation_history: Optional[list] = []
    current_kernel_context: Optional[Dict[str, Any]] = None


def get_rocm_telemetry() -> Dict[str, Any]:

    result = subprocess.run(
        [
            "rocm-smi",
            "--showuse",
            "--showmeminfo",
            "vram",
            "--showtemp",
            "--json",
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=5,
    )
    data = json.loads(result.stdout)

    return {
        "backend": "rocm",
        "vendor": "AMD",
        "data": data,
    }


def get_cuda_telemetry() -> Dict[str, Any]:
    """
    Reading telemetry CUDA from pynvml.
    """
    import pynvml

    pynvml.nvmlInit()

    try:
        device_count = pynvml.nvmlDeviceGetCount()
        cards = {}

        for index in range(device_count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(index)

            name = pynvml.nvmlDeviceGetName(handle)
            if isinstance(name, bytes):
                name = name.decode("utf-8", errors="replace")

            memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
            utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)

            temperature = None
            try:
                temperature = pynvml.nvmlDeviceGetTemperature(
                    handle,
                    pynvml.NVML_TEMPERATURE_GPU,
                )
            except Exception:
                pass

            power_watts = None
            try:
                power_mw = pynvml.nvmlDeviceGetPowerUsage(handle)
                power_watts = round(power_mw / 1000.0, 2)
            except Exception:
                pass

            card_key = f"card{index}"

            cards[card_key] = {
                "GPU usem(%)": str(utilization.gpu),
                "GPU Memory Use (%)": str(utilization.memory),
                "VRAM Total Memory (B)": str(memory.total),
                "VRAM Total Used Memory (B)": str(memory.used),
                "VRAM Total Free Memory (B)": str(memory.free),
                "Temperature (Sensor edge) (C)": (
                    str(temperature) if temperature is not None else "N/A"
                ),
                "Power (W)": (
                    str(power_watts) if power_watts is not None else "N/A"
                ),
                "GPU Name": name,
            }

        return {
            "backend": "cuda",
            "vendor": "NVIDIA",
            "data": cards,
        }

    finally:
        pynvml.nvmlShutdown()

def get_gpu_telemetry_universal() -> Dict[str, Any]:
     #ROCm
     try:
         return get_rocm_telemetry()
     except Exception as rocm_error:
         rocm_message = str(rocm_error)

     #NVIDIA CUDA
     try:
         return get_cuda_telemetry()
     except Exception as cuda_error:
         cuda_message = str(cuda_error)

     #fallback
     return {
         "backend": "none",
         "vendor": "unknown",
         "status": "error",
         "message": "GPU Backend isn't found",
         "errors": {
              "rocm": rocm_message,
              "cuda": cuda_message,
        },
    }

def detect_compute_backend() -> str:

    try:
        import torch

        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0).lower()
            if "amd" in device_name or "radeon" in device_name:
                return "rocm"

            return "cuda"

    except Exception:
        pass

    return"cpu"
            

@app.get("/api/v1/health")
async def health_check():
    telemetry = get_gpu_telemetry_universal()

    return {
        "status": "online",
        "service": "Mandala ROCm Engine",
        "frameworks": ["PyTorch 2.4-rocm", "Triton 3.0", "FastAPI"],
        "compute_backend": detect_compute_backend(),
        "telemetry_backend": telemetry.get("backend"),
        "gpu_vendor": telemetry.get("vendor", "unknown"),
    }


@app.websocket("/ws/gpu-telemetry")
async def websocket_gpu_telemetry(websocket: WebSocket):
    """Streams real-time GPU VRAM, compute usage, temperature, and power via ROCm SMI."""
    await websocket.accept()
    try:
        while True:
            telemetry = get_gpu_telemetry_universal()
            await websocket.send_json(telemetry)
            await asyncio.sleep(1.0)

    except WebSocketDisconnect:
        pass

    except Exception as error:
        print(f"WebSocket telemetry error: {error}")

        try:
            await websocket.send_json(
                {
                    "backend": "unknown",
                    "status": "error",
                    "message": str(error),
                }
            )
        except Exception:
            pass

@app.post("/api/v1/triton/compile-and-run")
async def compile_and_run(request: CompileRunRequest):
    """Compiles and executes Triton kernels dynamically on PyTorch ROCm backend."""
    try:
        request_data = request.model_dump()

        request_data["compute_backend"] = detect_compute_backend()

        result = compile_and_execute_kernel(request._data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kernel compilation failed: {str(e)}")


@app.post("/api/v1/copilot/chat")
async def copilot_chat(request: CopilotChatRequest):
    """Pydantic AI agent for diagnosing kernel errors and suggesting block/grid sizes."""
    user_query = request.message
    current_kernel = request.current_kernel_context

    # Try Pydantic AI agent connected to local Ollama (qwen3.5:b)
    if copilot_agent:
        try:
            result = await copilot_agent.run(user_query)

            diagnosis = (
                result.data.model_dump()
                if hasattr(result.data, "model_dump")
                else result.data.dict()
            )

            return {
                "source": "pydantic_ai_ollama",
                "diagnosis": diagnosis,
            }
        
        except Exception as err:
            # Fallback gracefully
            pass

    fallback_data = fallback_copilot_diagnosis(user_query, current_kernel)
    return {
        "source": "pydantic_ai_rule_engine",
        "diagnosis": fallback_data
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
