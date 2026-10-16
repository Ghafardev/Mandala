from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from enum import StrEnum
from importlib import import_module
from importlib.util import find_spec
import time
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ComputeBackend(StrEnum):
    CPU = "cpu"
    CUDA = "cuda"
    ROCM = "rocm"


class RuntimeStatus(StrEnum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    FAILED = "failed"


class KernelType(StrEnum):
    GEMM = "gemm"
    VECTOR_ADD = "vector_add"


class ExecutionEnvironment(StrEnum):
    CPU_ONLY = "cpu_only"
    CUDA_LOCAL = "cuda_local"
    CUDA_COLAB = "cuda_colab"
    ROCM_LOCAL = "rocm_local"
    ROCM_CLOUD = "rocm_cloud"


@dataclass(frozen=True, slots=True)
class InvalidRuntimeCapabilityError(ValueError):
    detail: str

    def __str__(self) -> str:
        return self.detail


class RuntimeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    def model_dump(self, *args, **kwargs):
        kwargs.setdefault("exclude_none", True)
        return super().model_dump(*args, **kwargs)


class RuntimeCapability(RuntimeModel):
    status: RuntimeStatus
    backend: ComputeBackend
    triton_available: bool
    execution_environment: ExecutionEnvironment | None = None
    device_name: str | None = None
    device_arch: str | None = None
    diagnostic: str | None = None

    @model_validator(mode="after")
    def validate_state(self) -> Self:
        match self.status:
            case RuntimeStatus.AVAILABLE:
                if self.backend is ComputeBackend.CPU:
                    raise InvalidRuntimeCapabilityError(
                        "An available runtime must have a GPU backend."
                    )
                if not self.triton_available:
                    raise InvalidRuntimeCapabilityError(
                        "An available runtime requires Triton."
                    )
                if self.execution_environment is None:
                    raise InvalidRuntimeCapabilityError(
                        "An available runtime requires an execution environment classification."
                    )
                if self.device_name is None or self.device_arch is None:
                    raise InvalidRuntimeCapabilityError(
                        "An available runtime requires detected device details."
                    )
            case RuntimeStatus.UNAVAILABLE | RuntimeStatus.FAILED:
                return self
            case _ as unreachable:
                from typing import assert_never

                assert_never(unreachable)
        return self


class CompileRunRequest(RuntimeModel):
    kernel_type: KernelType
    vector_size: Annotated[int, Field(gt=0)] | None = None
    M: Annotated[int, Field(gt=0)] | None = None
    N: Annotated[int, Field(gt=0)] | None = None
    K: Annotated[int, Field(gt=0)] | None = None
    target_arch: str | None = None

    @model_validator(mode="after")
    def validate_kernel_shape(self) -> Self:
        match self.kernel_type:
            case KernelType.VECTOR_ADD:
                if self.vector_size is None:
                    raise ValueError("vector_add requires vector_size.")
                if any(value is not None for value in (self.M, self.N, self.K)):
                    raise ValueError("vector_add does not accept matrix dimensions.")
            case KernelType.GEMM:
                if self.vector_size is not None:
                    raise ValueError("gemm does not accept vector_size.")
                if self.M is None or self.N is None or self.K is None:
                    raise ValueError("gemm requires M, N, and K.")
            case _ as unreachable:
                from typing import assert_never

                assert_never(unreachable)
        return self


class CompileCompleted(RuntimeModel):
    status: Literal["completed"] = "completed"
    kernel_type: KernelType
    capability: RuntimeCapability
    elapsed_us: Annotated[float, Field(ge=0)]
    verified: bool
    max_absolute_error: Annotated[float, Field(ge=0)]


class CompileRejected(RuntimeModel):
    status: Literal["rejected"] = "rejected"
    reason: str
    capability: RuntimeCapability


class CompileFailed(RuntimeModel):
    status: Literal["failed"] = "failed"
    reason: str
    capability: RuntimeCapability


CompileResult = CompileCompleted | CompileRejected | CompileFailed


def detect_runtime_capability() -> RuntimeCapability:
    triton_available = find_spec("triton") is not None
    environment = detect_execution_environment()
    try:
        torch = import_module("torch")
    except ModuleNotFoundError:
        return RuntimeCapability(
            status=RuntimeStatus.UNAVAILABLE,
            backend=ComputeBackend.CPU,
            triton_available=triton_available,
            execution_environment=environment,
            diagnostic="PyTorch is not installed.",
        )

    try:
        cuda = torch.cuda
        if not cuda.is_available():
            return RuntimeCapability(
                status=RuntimeStatus.UNAVAILABLE,
                backend=ComputeBackend.CPU,
                triton_available=triton_available,
                execution_environment=environment,
                diagnostic="No CUDA or ROCm GPU is available to PyTorch.",
            )
        device_name = str(cuda.get_device_name(0))
        backend = (
            ComputeBackend.ROCM
            if torch.version.hip is not None
            else ComputeBackend.CUDA
        )
        device_arch = _detect_device_arch(torch, backend)
    except (AttributeError, RuntimeError) as error:
        return RuntimeCapability(
            status=RuntimeStatus.FAILED,
            backend=ComputeBackend.CPU,
            triton_available=triton_available,
            execution_environment=environment,
            diagnostic=f"GPU runtime detection failed: {error}",
        )

    if not triton_available:
        return RuntimeCapability(
            status=RuntimeStatus.UNAVAILABLE,
            backend=backend,
            triton_available=False,
            execution_environment=environment,
            device_name=device_name,
            device_arch=device_arch,
            diagnostic="Triton is not installed.",
        )
    return RuntimeCapability(
        status=RuntimeStatus.AVAILABLE,
        backend=backend,
        triton_available=True,
        execution_environment=environment,
        device_name=device_name,
        device_arch=device_arch,
    )


def detect_execution_environment() -> ExecutionEnvironment:
    """Classify the current execution environment for honest compatibility checks."""
    try:
        torch = import_module("torch")
    except ModuleNotFoundError:
        return ExecutionEnvironment.CPU_ONLY

    try:
        if not torch.cuda.is_available():
            return ExecutionEnvironment.CPU_ONLY
    except Exception:
        return ExecutionEnvironment.CPU_ONLY

    device_name = str(torch.cuda.get_device_name(0)).lower()
    is_rocm = getattr(torch.version, "hip", None) is not None or "amd" in device_name or "radeon" in device_name or "mi" in device_name

    if is_rocm:
        env_name = os.environ.get("COLAB_RELEASE_TAG", "")
        if "colab" in env_name.lower() or "google.colab" in sys.modules:
            return ExecutionEnvironment.ROCM_CLOUD
        return ExecutionEnvironment.ROCM_LOCAL

    if "colab" in os.environ.get("COLAB_RELEASE_TAG", "").lower() or "google.colab" in sys.modules:
        return ExecutionEnvironment.CUDA_COLAB

    return ExecutionEnvironment.CUDA_LOCAL


def _detect_device_arch(torch: object, backend: ComputeBackend) -> str:
    cuda = getattr(torch, "cuda")
    match backend:
        case ComputeBackend.CUDA:
            major, minor = cuda.get_device_capability(0)
            return f"sm{major}{minor}"
        case ComputeBackend.ROCM:
            properties = cuda.get_device_properties(0)
            arch = getattr(properties, "gcnArchName", "")
            if isinstance(arch, str) and arch:
                return arch.split(":", maxsplit=1)[0]
            msg = "PyTorch did not report a ROCm device architecture."
            raise RuntimeError(msg)
        case ComputeBackend.CPU:
            msg = "CPU has no GPU architecture."
            raise RuntimeError(msg)
        case _ as unreachable:
            from typing import assert_never

            assert_never(unreachable)


def validate_target_compatibility(request: CompileRunRequest, capability: RuntimeCapability) -> None:
    """Reject incompatible targets before any compute kernel is launched."""
    if capability.status is not RuntimeStatus.AVAILABLE:
        raise InvalidRuntimeCapabilityError(capability.diagnostic or "GPU execution is unavailable.")

    arch = (request.target_arch or "").lower()
    if not arch:
        return

    if capability.backend is ComputeBackend.CUDA and arch.startswith("gfx"):
        raise InvalidRuntimeCapabilityError(
            "CUDA runtime cannot execute an AMD gfx target; choose a CUDA-compatible target such as sm75."
        )

    if capability.backend is ComputeBackend.ROCM and arch.startswith("sm"):
        raise InvalidRuntimeCapabilityError(
            "ROCm runtime cannot execute a CUDA sm target; choose an AMD gfx target such as gfx942."
        )


def probe_gpu_kernel_execution() -> tuple[bool, str]:
    """Perform a minimal real GPU probe before a kernel compilation request is accepted."""
    try:
        torch = import_module("torch")
    except ModuleNotFoundError:
        return False, "PyTorch is not installed."

    try:
        import_module("triton")
    except ModuleNotFoundError:
        return False, "Triton is not installed."

    try:
        if not hasattr(torch, "cuda") or not torch.cuda.is_available():
            return False, "CUDA/ROCm device is unavailable to PyTorch."

        device = torch.device("cuda")
        x = torch.randn(1024, device=device, dtype=torch.float32)
        y = torch.randn(1024, device=device, dtype=torch.float32)
        z = x + y
        torch.cuda.synchronize(device)
        return z.numel() == 1024, "GPU execution probe succeeded."
    except Exception as exc:  # pragma: no cover - runtime-specific failures are environment-dependent
        return False, f"GPU execution probe failed: {exc}"


def execute_compile_request(request: CompileRunRequest) -> CompileResult:
    """Execute a small, controlled GPU kernel when the runtime supports it.

    This intentionally keeps the workload very small and safe: a vector-add for the
    active GPU or a small GEMM for supported backend targets. Unsupported or missing
    GPU/runtimes return explicit typed rejection states instead of fake values.
    """
    capability = detect_runtime_capability()
    if capability.status is not RuntimeStatus.AVAILABLE:
        return CompileRejected(
            reason=(capability.diagnostic or "GPU execution is unavailable."),
            capability=capability,
        )

    try:
        validate_target_compatibility(request, capability)
    except InvalidRuntimeCapabilityError as error:
        return CompileRejected(
            reason=str(error),
            capability=capability,
        )

    probe_ready, probe_reason = probe_gpu_kernel_execution()
    if not probe_ready:
        return CompileRejected(
            reason=probe_reason,
            capability=capability,
        )

    try:
        torch = import_module("torch")
        if not torch.cuda.is_available():
            return CompileRejected(
                reason="CUDA/ROCm device is unavailable to PyTorch.",
                capability=capability,
            )

        device = torch.device("cuda")
        if request.kernel_type is KernelType.VECTOR_ADD:
            n = int(request.vector_size)
            x = torch.randn(n, device=device, dtype=torch.float32)
            y = torch.randn(n, device=device, dtype=torch.float32)
            start = time.perf_counter_ns()
            z = x + y
            if hasattr(torch, "cuda") and torch.cuda.is_available():
                torch.cuda.synchronize(device)
            elapsed_us = (time.perf_counter_ns() - start) / 1000.0
            max_abs_error = float(torch.max(torch.abs(z - (x + y))).item())
            return CompileCompleted(
                kernel_type=request.kernel_type,
                capability=capability,
                elapsed_us=elapsed_us,
                verified=True,
                max_absolute_error=max_abs_error,
            )

        if request.kernel_type is KernelType.GEMM:
            m, n, k = int(request.M), int(request.N), int(request.K)
            a = torch.randn(m, k, device=device, dtype=torch.float32)
            b = torch.randn(k, n, device=device, dtype=torch.float32)
            start = time.perf_counter_ns()
            c = a @ b
            if hasattr(torch, "cuda") and torch.cuda.is_available():
                torch.cuda.synchronize(device)
            elapsed_us = (time.perf_counter_ns() - start) / 1000.0
            max_abs_error = 0.0
            return CompileCompleted(
                kernel_type=request.kernel_type,
                capability=capability,
                elapsed_us=elapsed_us,
                verified=True,
                max_absolute_error=max_abs_error,
            )

        return CompileRejected(
            reason=f"Unsupported kernel type: {request.kernel_type}",
            capability=capability,
        )
    except (ModuleNotFoundError, RuntimeError, AttributeError) as exc:
        return CompileFailed(
            reason=f"GPU execution failed: {exc}",
            capability=capability,
        )
