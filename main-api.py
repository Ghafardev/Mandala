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
from pydantic import BaseModel, Field, ValidationError

from backend.telemetry import parse_rocm_smi
from backend.runtime import (
    CompileRejected,
    CompileRunRequest,
    RuntimeStatus,
    detect_execution_environment,
    detect_runtime_capability,
    execute_compile_request,
)
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
    capability = detect_runtime_capability()
    return capability.backend.value


@app.get("/api/v1/health")
async def health_check():
    capability = detect_runtime_capability()
    telemetry = get_gpu_telemetry_universal()
    execution_environment = (
        capability.execution_environment.value
        if capability.execution_environment is not None
        else detect_execution_environment().value
    )

    return {
        "status": "online" if capability.status is RuntimeStatus.AVAILABLE else "degraded",
        "ready_for_execution": capability.status is RuntimeStatus.AVAILABLE,
        "service": "Mandala ROCm Engine",
        "frameworks": ["PyTorch", "Triton", "FastAPI"],
        "compute_backend": capability.backend.value,
        "execution_environment": execution_environment,
        "runtime_capability": capability.model_dump(mode="json"),
        "telemetry_backend": telemetry.get("backend"),
        "gpu_vendor": telemetry.get("vendor", "unknown"),
        "diagnostic": capability.diagnostic,
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
async def compile_and_run(request_data: dict):
    """Evaluates a small, safe kernel request against the real runtime capability.

    The frontend sends either the legacy shape or the typed runtime model shape. This
    route accepts both and converts them into the same backend contract.
    """
    try:
        payload = dict(request_data)
        if "kernel_type" not in payload:
            raise HTTPException(status_code=400, detail="kernel_type is required.")

        # Support the older GUI payload shape by translating it to the typed runtime request.
        if "vector_size" not in payload and "M" not in payload:
            payload["vector_size"] = payload.get("vector_size") or payload.get("N")

        if "kernel_type" in payload and payload["kernel_type"] == "vector_add":
            payload["kernel_type"] = "vector_add"
        elif "kernel_type" in payload and payload["kernel_type"] == "gemm":
            payload["kernel_type"] = "gemm"

        request = CompileRunRequest.model_validate(payload)
        result = execute_compile_request(request)
        if isinstance(result, CompileRejected):
            raise HTTPException(status_code=409, detail=result.model_dump(mode="json"))
        if isinstance(result, Exception):
            raise HTTPException(status_code=500, detail=str(result))
        return result.model_dump(mode="json")
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive safety net
        raise HTTPException(status_code=500, detail=f"Kernel compilation failed: {exc}") from exc


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
