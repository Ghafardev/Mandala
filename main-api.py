"""
Mandala Backend API Engine (FastAPI)
Entry point for AMD ROCm & Triton LLM Studio backend.
Exposes WebSocket telemetry, dynamic Triton compilation, and AI Copilot endpoints.
"""
import asyncio
import json
import os
import platform
import subprocess
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from backend.runtime import (
    CompileRejected,
    CompileRunRequest,
    RuntimeStatus,
    detect_execution_environment,
    detect_runtime_capability,
    execute_compile_request,
)
from backend.copilot_agent import create_pydantic_ai_agent, fallback_copilot_diagnosis

from backend.routers.auth import router as auth_router
from backend.routers.task import task_router
from backend.database import initialize_database
from backend.telemetry import normalize_rocm_smi_json


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Create the local SQLite schema before serving the first request."""
    await asyncio.to_thread(initialize_database)
    yield


app = FastAPI(
    title="Mandala - AMD ROCm & Triton API Engine",
    description="Low-code API engine to compile Triton kernels and stream ROCm/CUDA hardware telemetry",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for the local Vite client. Credentialed requests (the session cookie)
# require an explicit origin; the wildcard "*" is rejected by browsers.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(task_router)

# Initialize Pydantic AI agent if available
copilot_agent = create_pydantic_ai_agent()


class CopilotChatRequest(BaseModel):
    message: str
    conversation_history: Optional[list] = []
    current_kernel_context: Optional[Dict[str, Any]] = None


def get_cpu_telemetry() -> Dict[str, Any]:
    """Read system-wide CPU specifications and live status via psutil."""
    try:
        import psutil
    except ModuleNotFoundError:
        return {}

    per_core = [round(value, 1) for value in psutil.cpu_percent(interval=None, percpu=True)]
    frequency = psutil.cpu_freq()  # None where the platform has no frequency data
    load_average = (
        [round(value, 2) for value in psutil.getloadavg()]
        if hasattr(psutil, "getloadavg")
        else None  # Windows has no load average
    )

    return {
        "specs": {
            "cpu_model": platform.processor() or platform.uname().processor or "Unknown",
            "physical_cores": psutil.cpu_count(logical=False),
            "total_cores": psutil.cpu_count(logical=True),
            "frequency_mhz": round(frequency.current) if frequency else None,
        },
        "status": {
            "overall_utilization": round(sum(per_core) / len(per_core), 1) if per_core else 0.0,
            "per_core_utilization": per_core,
            "load_average": load_average,
        },
    }


def get_rocm_telemetry() -> Dict[str, Any]:
    """Read rocm-smi and normalize it into the frontend ``gpus[]`` contract."""
    result = subprocess.run(
        [
            "rocm-smi",
            "--showuse",
            "--showmeminfo",
            "vram",
            "--showtemp",
            "--showpower",
            "--json",
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=5,
    )

    return {
        **normalize_rocm_smi_json(result.stdout),
        "backend": "rocm",
        "vendor": "AMD",
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
    # AMD ROCm
    try:
        return get_rocm_telemetry()
    except Exception as rocm_error:
        rocm_message = str(rocm_error)

    # NVIDIA CUDA
    try:
        return get_cuda_telemetry()
    except Exception as cuda_error:
        cuda_message = str(cuda_error)

    # CPU-only fallback: keep the frontend contract (``gpus`` is always a list).
    return {
        "backend": "none",
        "vendor": "unknown",
        "detected": False,
        "driver": "unavailable",
        "gpus": [],
        "status": "unavailable",
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
    """Streams real-time CPU status plus GPU VRAM, usage, temperature, and power."""
    await websocket.accept()
    try:
        while True:
            # CPU telemetry rides along with the GPU payload (which may be "none")
            await websocket.send_json(
                {**get_gpu_telemetry_universal(), "cpu": get_cpu_telemetry()}
            )
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


def build_copilot_prompt(
    message: str,
    conversation_history: Optional[list],
    current_kernel_context: Optional[Dict[str, Any]],
) -> str:
    """Fold every declared request field into the single prompt the agent receives."""
    sections: list = []

    if current_kernel_context:
        sections.append(
            f"[Active kernel in GUI] {json.dumps(current_kernel_context, sort_keys=True, default=str)}"
        )

    for item in (conversation_history or [])[-6:]:
        if not isinstance(item, dict):
            continue
        content = item.get("content") or item.get("text")
        if content:
            sections.append(f"{item.get('role', 'user')}: {content}")

    sections.append(f"user: {message}")
    return "\n\n".join(sections)


@app.post("/api/v1/copilot/chat")
async def copilot_chat(request: CopilotChatRequest):
    """Pydantic AI agent for diagnosing kernel errors and suggesting block/grid sizes."""
    user_query = request.message
    current_kernel = request.current_kernel_context
    agent_prompt = build_copilot_prompt(
        user_query, request.conversation_history, current_kernel
    )

    # Try Pydantic AI agent connected to local Ollama (qwen3.5:b)
    if copilot_agent:
        try:
            result = await copilot_agent.run(agent_prompt)

            # Pydantic AI V2 exposes ``output``; older releases used ``data``.
            output = getattr(result, "output", None)
            if output is None:
                output = result.data

            diagnosis = (
                output.model_dump()
                if hasattr(output, "model_dump")
                else output.dict()
            )

            return {
                "source": "pydantic_ai_ollama",
                "diagnosis": diagnosis,
            }
        
        except Exception as err:
            # Fallback gracefully, but leave a trace of why the model was skipped.
            print(f"Copilot agent unavailable, using rule engine: {err}")

    fallback_data = fallback_copilot_diagnosis(user_query, current_kernel)
    return {
        "source": "pydantic_ai_rule_engine",
        "diagnosis": fallback_data
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("MANDALA_HOST", "127.0.0.1"),
        port=int(os.getenv("MANDALA_PORT", "8000")),
    )
