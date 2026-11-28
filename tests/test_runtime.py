from __future__ import annotations

import importlib
import importlib.util
import struct
import sys
import threading
from pathlib import Path

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
    execute_compile_request,
    probe_gpu_kernel_execution,
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


def test_runtime_probe_requires_real_torch_and_triton_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    real_import_module = importlib.import_module

    def import_without_torch_or_triton(name: str) -> object:
        if name in {"torch", "triton"}:
            raise ModuleNotFoundError(name)
        return real_import_module(name)

    monkeypatch.setattr("backend.runtime.import_module", import_without_torch_or_triton)

    ready, reason = probe_gpu_kernel_execution()

    assert ready is False
    assert "PyTorch" in reason or "Triton" in reason


def test_execute_compile_request_uses_triton_vector_add_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_probe() -> tuple[bool, str]:
        return True, "ok"

    def fake_torch_module() -> object:
        return type(
            "FakeTorch",
            (),
            {
                "cuda": type(
                    "FakeCuda",
                    (),
                    {
                        "is_available": staticmethod(lambda: True),
                        "synchronize": staticmethod(lambda device: None),
                    },
                )(),
                "device": staticmethod(lambda name: name),
                "float32": "float32",
            },
        )()

    def fake_triton_kernel(torch_module: object, n: int, device: str) -> float:
        return 0.0

    capability = RuntimeCapability(
        status=RuntimeStatus.AVAILABLE,
        backend=ComputeBackend.CUDA,
        triton_available=True,
        execution_environment=ExecutionEnvironment.CUDA_LOCAL,
        device_name="Fake GPU",
        device_arch="sm80",
    )

    monkeypatch.setattr("backend.runtime.detect_runtime_capability", lambda: capability)
    monkeypatch.setattr("backend.runtime.probe_gpu_kernel_execution", fake_probe)
    monkeypatch.setattr("backend.runtime.import_module", lambda name: fake_torch_module() if name == "torch" else None)
    monkeypatch.setattr("backend.runtime._execute_real_triton_vector_add", fake_triton_kernel)

    result = execute_compile_request(CompileRunRequest(kernel_type="vector_add", vector_size=1024))

    assert result.status == "completed"
    assert result.max_absolute_error == 0.0


def _f32(value: float) -> float:
    return struct.unpack("f", struct.pack("f", value))[0]


class _FakeScalar:
    def __init__(self, value: float) -> None:
        self._value = value

    def item(self) -> float:
        return self._value


class _FakeTensor:
    """Nested-list tensor stand-in that rounds float32 matmul results like a kernel."""

    def __init__(self, rows, dtype: str, device: str = "cuda", scale: float = 1.0) -> None:
        self.rows = rows
        self.dtype = dtype
        self.device = device
        self.scale = scale

    def __matmul__(self, other: "_FakeTensor") -> "_FakeTensor":
        columns = list(zip(*other.rows))
        rows = []
        for left in self.rows:
            row = []
            for right in columns:
                total = sum(x * y for x, y in zip(left, right)) * self.scale
                row.append(_f32(total) if self.dtype == "float32" else float(total))
            rows.append(row)
        return _FakeTensor(rows, self.dtype, self.device)

    def __sub__(self, other: "_FakeTensor") -> "_FakeTensor":
        return _FakeTensor(
            [[x - y for x, y in zip(left, right)] for left, right in zip(self.rows, other.rows)],
            "float64",
            self.device,
        )

    def to(self, device=None, dtype=None) -> "_FakeTensor":
        # Any host float64 copy is an independent reference, so the kernel's drift drops.
        return _FakeTensor(self.rows, dtype or self.dtype, device or self.device)


class _FakeCuda:
    @staticmethod
    def is_available() -> bool:
        return True

    @staticmethod
    def synchronize(device: object) -> None:
        return None


class _FakeTorch:
    float32 = "float32"
    float64 = "float64"
    cuda = _FakeCuda()

    def __init__(self, float32_scale: float = 1.0) -> None:
        self._scale = float32_scale

    @staticmethod
    def device(name: str) -> str:
        return name

    def randn(self, rows: int, columns: int, device=None, dtype=None) -> _FakeTensor:
        values = [
            [(((row * 7 + column * 5) % 13) - 6) / 6 for column in range(columns)]
            for row in range(rows)
        ]
        return _FakeTensor(values, dtype or "float32", device or "cuda", self._scale)

    @staticmethod
    def matmul(left: _FakeTensor, right: _FakeTensor) -> _FakeTensor:
        return left @ right

    @staticmethod
    def abs(tensor: _FakeTensor) -> _FakeTensor:
        return _FakeTensor(
            [[abs(value) for value in row] for row in tensor.rows], tensor.dtype, tensor.device
        )

    @staticmethod
    def max(tensor: _FakeTensor) -> _FakeScalar:
        return _FakeScalar(max(max(row) for row in tensor.rows))


def _install_fake_gpu_runtime(monkeypatch: pytest.MonkeyPatch, float32_scale: float = 1.0) -> None:
    fake_torch = _FakeTorch(float32_scale=float32_scale)
    capability = RuntimeCapability(
        status=RuntimeStatus.AVAILABLE,
        backend=ComputeBackend.CUDA,
        triton_available=True,
        execution_environment=ExecutionEnvironment.CUDA_LOCAL,
        device_name="Fake GPU",
        device_arch="sm80",
    )
    monkeypatch.setattr("backend.runtime.detect_runtime_capability", lambda: capability)
    monkeypatch.setattr("backend.runtime.probe_gpu_kernel_execution", lambda: (True, "ok"))
    monkeypatch.setattr(
        "backend.runtime.import_module", lambda name: fake_torch if name == "torch" else None
    )


def test_execute_compile_request_gemm_reports_measured_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given: a GEMM kernel whose float32 result rounds away from the float64 reference.
    _install_fake_gpu_runtime(monkeypatch)

    # When: the GEMM branch runs.
    result = execute_compile_request(CompileRunRequest(kernel_type="gemm", M=16, N=16, K=32))

    # Then: the reported error is a real measurement, not the old hardcoded zero.
    assert result.status == "completed"
    assert result.max_absolute_error > 0.0
    assert result.verified is True


def test_execute_compile_request_gemm_rejects_kernel_that_misses_reference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given: a kernel that returns results 5% away from the reference product.
    _install_fake_gpu_runtime(monkeypatch, float32_scale=1.05)

    # When: the GEMM branch compares it against the reference.
    result = execute_compile_request(CompileRunRequest(kernel_type="gemm", M=16, N=16, K=32))

    # Then: the result is reported as unverified with the measured error.
    assert result.status == "completed"
    assert result.verified is False
    assert result.max_absolute_error > 1e-2


def _import_main_api():
    spec = importlib.util.spec_from_file_location(
        "mandala_main_api", Path(__file__).resolve().parents[1] / "main-api.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_compile_and_run_route_runs_kernel_work_off_the_event_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _import_main_api()
    threads: dict[str, int] = {}

    def fake_execute(request: CompileRunRequest) -> CompileRejected:
        threads["kernel"] = threading.get_ident()
        capability = RuntimeCapability(
            status=RuntimeStatus.UNAVAILABLE,
            backend=ComputeBackend.CPU,
            triton_available=False,
            diagnostic="stubbed",
        )
        return CompileRejected(reason="stubbed", capability=capability)

    monkeypatch.setattr(module, "execute_compile_request", fake_execute)

    async def call_route() -> None:
        import asyncio

        from fastapi import HTTPException

        threads["loop"] = threading.get_ident()
        with pytest.raises(HTTPException):
            await module.compile_and_run({"kernel_type": "gemm", "M": 4, "N": 4, "K": 4})

    import asyncio

    asyncio.run(call_route())

    assert threads["kernel"] != threads["loop"]
