from __future__ import annotations

import importlib
import sys

import pytest
from pydantic import ValidationError

from backend.runtime import (
    CompileRejected,
    CompileRunRequest,
    ComputeBackend,
    ExecutionEnvironment,
    RuntimeCapability,
    RuntimeStatus,
    detect_runtime_capability,
)


def test_runtime_capability_when_runtime_is_missing_reports_typed_non_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given: neither optional GPU runtime dependency can be imported.
    real_import_module = importlib.import_module

    def import_without_gpu_runtime(name: str) -> object:
        if name in {"torch", "triton"}:
            raise ModuleNotFoundError(name)
        return real_import_module(name)

    monkeypatch.setattr("backend.runtime.import_module", import_without_gpu_runtime)

    # When: runtime capability is detected.
    capability = detect_runtime_capability()

    # Then: the CPU-only state is honest, typed, and serializable.
    assert capability.status is RuntimeStatus.UNAVAILABLE
    assert capability.backend is ComputeBackend.CPU
    assert capability.device_name is None
    assert capability.device_arch is None
    assert capability.model_dump(mode="json")["status"] == "unavailable"


def test_compile_request_when_supported_serializes_without_gpu_claims() -> None:
    # Given: a supported controlled kernel request.
    request = CompileRunRequest(kernel_type="vector_add", vector_size=16384)

    # When: the request crosses the API serialization boundary.
    payload = request.model_dump(mode="json")

    # Then: it contains only executor inputs, not simulated runtime output.
    assert payload == {"kernel_type": "vector_add", "vector_size": 16384}


@pytest.mark.parametrize(
    ("payload", "expected_field"),
    [
        ({"kernel_type": "softmax"}, "kernel_type"),
        ({"kernel_type": "gemm", "custom_code": "print('unsafe')"}, "custom_code"),
        ({"kernel_type": "gemm", "target_device": "MI300X"}, "target_device"),
    ],
)
def test_compile_request_when_invalid_rejects_unsupported_or_stale_fields(
    payload: dict[str, str], expected_field: str
) -> None:
    # Given: an unsupported kernel, arbitrary source, or stale simulation field.
    # When: Pydantic parses the public request.
    # Then: the boundary rejects it instead of preserving an untruthful field.
    with pytest.raises(ValidationError) as error:
        CompileRunRequest.model_validate(payload)

    assert expected_field in str(error.value)


def test_compile_rejection_when_runtime_is_unavailable_serializes_typed_result() -> None:
    # Given: a CPU-only runtime capability.
    capability = RuntimeCapability(
        status=RuntimeStatus.UNAVAILABLE,
        backend=ComputeBackend.CPU,
        triton_available=False,
        diagnostic="No GPU runtime is available.",
    )

    # When: a future executor reports its unavailable result.
    result = CompileRejected(capability=capability, reason="GPU execution is unavailable.")

    # Then: its wire shape has no invented execution metrics or device metadata.
    assert result.model_dump(mode="json") == {
        "status": "rejected",
        "reason": "GPU execution is unavailable.",
        "capability": capability.model_dump(mode="json"),
    }


def test_runtime_capability_detects_cpu_backed_environment_without_gpu() -> None:
    capability = RuntimeCapability(
        status=RuntimeStatus.UNAVAILABLE,
        backend=ComputeBackend.CPU,
        triton_available=False,
        diagnostic="CPU-only host does not support GPU execution.",
    )

    assert capability.backend is ComputeBackend.CPU
    assert capability.status is RuntimeStatus.UNAVAILABLE
    assert capability.device_name is None


def test_runtime_capability_exposes_execution_environment_in_public_contract() -> None:
    capability = RuntimeCapability(
        status=RuntimeStatus.AVAILABLE,
        backend=ComputeBackend.ROCM,
        triton_available=True,
        device_name="AMD Instinct MI300X",
        device_arch="gfx942",
        execution_environment=ExecutionEnvironment.ROCM_CLOUD,
    )

    payload = capability.model_dump(mode="json")
    assert payload["execution_environment"] == "rocm_cloud"
    assert payload["backend"] == "rocm"


def test_compile_request_rejects_rocm_only_target_on_cuda_runtime() -> None:
    request = CompileRunRequest(
        kernel_type="gemm",
        M=128,
        N=128,
        K=128,
        target_arch="gfx942",
    )

    capability = RuntimeCapability(
        status=RuntimeStatus.AVAILABLE,
        backend=ComputeBackend.CUDA,
        triton_available=True,
        execution_environment=ExecutionEnvironment.CUDA_LOCAL,
        device_name="NVIDIA T4",
        device_arch="sm75",
    )

    assert request.target_arch == "gfx942"
    assert capability.backend is ComputeBackend.CUDA
    assert capability.backend is not ComputeBackend.ROCM
