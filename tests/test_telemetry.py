"""Contract tests for normalized hardware telemetry."""

from __future__ import annotations

from backend.telemetry import (
    RocmSmiCommandResult,
    TelemetryProvider,
    normalize_nvml_devices,
    normalize_rocm_smi_json,
)


class MissingRocmSmi:
    """A ROCm command boundary representing a CPU-only host."""

    def run(self) -> RocmSmiCommandResult:
        raise FileNotFoundError("rocm-smi")


class MalformedRocmSmi:
    """A ROCm command boundary returning malformed JSON."""

    def run(self) -> RocmSmiCommandResult:
        return RocmSmiCommandResult(returncode=0, stdout="{not-json", stderr="")


def test_telemetry_is_unavailable_when_hardware_providers_are_missing() -> None:
    # Given: a host without ROCm SMI or an NVML provider
    provider = TelemetryProvider(rocm_smi=MissingRocmSmi(), cuda_reader=lambda: None)

    # When: telemetry is sampled through the synchronous adapter
    payload = provider.sample()

    # Then: it reports an explicit empty state instead of a simulated GPU
    assert payload["detected"] is False
    assert payload["is_emulated"] is False
    assert payload["status"] == "unavailable"
    assert payload["gpus"] == []
    assert "MI300" not in payload["driver"]


def test_telemetry_is_unavailable_when_rocm_smi_returns_malformed_json() -> None:
    # Given: ROCm SMI succeeds as a process but emits malformed JSON
    provider = TelemetryProvider(rocm_smi=MalformedRocmSmi(), cuda_reader=lambda: None)

    # When: the telemetry provider samples the command output
    payload = provider.sample()

    # Then: the malformed response cannot create a GPU record
    assert payload["detected"] is False
    assert payload["status"] == "unavailable"
    assert payload["gpus"] == []
    assert "rocm-smi-invalid-json" in payload["diagnostics"]


def test_normalize_rocm_smi_json_uses_only_reported_values() -> None:
    # Given: valid ROCm SMI JSON from one card
    raw_output = """{
      "card0": {
        "Card series": "AMD Radeon RX 7900 XTX",
        "GPU use (%)": "37",
        "VRAM Total Memory (B)": "25769803776",
        "VRAM Total Used Memory (B)": "6442450944",
        "Temperature (Sensor edge) (C)": "61",
        "Average Graphics Package Power (W)": "245"
      }
    }"""

    # When: the parser normalizes the command output without executing a command
    payload = normalize_rocm_smi_json(raw_output, timestamp=123.0)

    # Then: the frontend shape holds actual reported values with no emulation
    assert payload["detected"] is True
    assert payload["is_emulated"] is False
    assert payload["timestamp"] == 123.0
    assert payload["gpus"] == [
        {
            "id": "card0",
            "name": "AMD Radeon RX 7900 XTX",
            "arch": "",
            "compute_units": 0,
            "stream_processors": 0,
            "matrix_cores": "",
            "vram_used_gb": 6.0,
            "vram_total_gb": 24.0,
            "vram_percent": 25.0,
            "gpu_utilization": 37.0,
            "memory_bandwidth_util": 0.0,
            "hbm_peak_bandwidth_tbs": 0.0,
            "temp_edge_c": 61.0,
            "temp_junction_c": 0.0,
            "temp_hbm_c": 0.0,
            "power_watts": 245.0,
            "power_cap_watts": 0.0,
            "fan_speed_rpm": 0,
            "pcie_link": "",
            "infinity_fabric_bandwidth_gbps": 0.0,
            "status": "available",
            "hsa_node": "",
        }
    ]


def test_normalize_nvml_devices_maps_pynvml_readings_into_the_gpus_contract() -> None:
    # Given: two NVML devices, the second with sensors the driver did not report
    devices = [
        {
            "index": 0,
            "name": "NVIDIA H100 80GB HBM3",
            "gpu_utilization": 87,
            "memory_utilization": 42,
            "vram_total_bytes": 85899345920,
            "vram_used_bytes": 42949672960,
            "temp_edge_c": 58,
            "power_watts": 312.5,
        },
        {
            "index": 1,
            "name": "NVIDIA H100 80GB HBM3",
            "gpu_utilization": None,
            "memory_utilization": None,
            "vram_total_bytes": 85899345920,
            "vram_used_bytes": 0,
            "temp_edge_c": None,
            "power_watts": None,
        },
    ]

    # When: the CUDA readings are normalized
    payload = normalize_nvml_devices(devices, timestamp=456.0)

    # Then: both cards land in the same gpus[] shape the ROCm path emits
    assert payload["detected"] is True
    assert payload["is_emulated"] is False
    assert payload["driver"] == "CUDA NVML"
    assert payload["timestamp"] == 456.0
    assert payload["status"] == "available"
    assert len(payload["gpus"]) == 2

    rocm_keys = set(normalize_rocm_smi_json('{"card0": {"GPU use (%)": "1"}}')["gpus"][0])

    first = payload["gpus"][0]
    assert set(first) == rocm_keys
    assert first["id"] == "card0"
    assert first["name"] == "NVIDIA H100 80GB HBM3"
    assert first["gpu_utilization"] == 87.0
    assert first["memory_bandwidth_util"] == 42.0
    assert first["vram_total_gb"] == 80.0
    assert first["vram_used_gb"] == 40.0
    assert first["vram_percent"] == 50.0
    assert first["temp_edge_c"] == 58.0
    assert first["power_watts"] == 312.5

    # Missing sensor readings degrade to zeros instead of breaking the frame
    second = payload["gpus"][1]
    assert second["id"] == "card1"
    assert second["gpu_utilization"] == 0.0
    assert second["vram_used_gb"] == 0.0
    assert second["vram_percent"] == 0.0
    assert second["temp_edge_c"] == 0.0
    assert second["power_watts"] == 0.0


def test_normalize_nvml_devices_without_devices_reports_unavailable() -> None:
    # Given/When: NVML reports no devices
    payload = normalize_nvml_devices([])

    # Then: the same explicit empty state as the ROCm path
    assert payload["detected"] is False
    assert payload["gpus"] == []
    assert payload["status"] == "unavailable"
