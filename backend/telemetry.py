"""Telemetry normalization and truthful backend capability handling.

This module exists to provide a stable, testable interface for GPU telemetry and to
avoid presenting simulated values as real hardware data.
"""

from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional


@dataclass(frozen=True)
class RocmSmiCommandResult:
    returncode: int
    stdout: str = ""
    stderr: str = ""


def _as_float(value: Any) -> float:
    """Coerce a hardware reading to float; missing, ``None`` or ``"N/A"`` read as 0.0."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _build_gpu_record(
    *,
    card_id: str,
    name: str,
    gpu_utilization: float,
    vram_used_bytes: float,
    vram_total_bytes: float,
    temp_edge_c: float = 0.0,
    power_watts: float = 0.0,
    memory_bandwidth_util: float = 0.0,
) -> Dict[str, Any]:
    """Build one ``gpus[]`` entry; shared so every vendor emits the same shape."""
    vram_total_gb = vram_total_bytes / (1024 ** 3)
    vram_used_gb = vram_used_bytes / (1024 ** 3)
    vram_percent = (vram_used_gb / vram_total_gb * 100.0) if vram_total_gb > 0 else 0.0

    return {
        "id": str(card_id),
        "name": name,
        "arch": "",
        "compute_units": 0,
        "stream_processors": 0,
        "matrix_cores": "",
        "vram_used_gb": round(vram_used_gb, 2),
        "vram_total_gb": round(vram_total_gb, 2),
        "vram_percent": round(vram_percent, 1),
        "gpu_utilization": round(gpu_utilization, 1),
        "memory_bandwidth_util": round(memory_bandwidth_util, 1),
        "hbm_peak_bandwidth_tbs": 0.0,
        "temp_edge_c": round(temp_edge_c, 1),
        "temp_junction_c": 0.0,
        "temp_hbm_c": 0.0,
        "power_watts": round(power_watts, 1),
        "power_cap_watts": 0.0,
        "fan_speed_rpm": 0,
        "pcie_link": "",
        "infinity_fabric_bandwidth_gbps": 0.0,
        "status": "available",
        "hsa_node": "",
    }


def normalize_rocm_smi_json(raw_json: str, timestamp: Optional[float] = None) -> Dict[str, Any]:
    """Normalize raw rocm-smi JSON into the frontend-facing telemetry shape."""
    parsed: Any
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"rocm-smi-invalid-json: {exc}") from exc

    cards: List[Dict[str, Any]] = []
    if isinstance(parsed, dict):
        for card_key, card_data in parsed.items():
            if not isinstance(card_data, dict):
                continue
            cards.append(
                _build_gpu_record(
                    card_id=card_key,
                    name=str(card_data.get("Card series") or card_key),
                    gpu_utilization=_as_float(card_data.get("GPU use (%)")),
                    vram_used_bytes=_as_float(card_data.get("VRAM Total Used Memory (B)")),
                    vram_total_bytes=_as_float(card_data.get("VRAM Total Memory (B)")),
                    temp_edge_c=_as_float(card_data.get("Temperature (Sensor edge) (C)")),
                    power_watts=_as_float(card_data.get("Average Graphics Package Power (W)")),
                )
            )

    payload = {
        "detected": bool(cards),
        "is_emulated": False,
        "driver": "ROCm SMI",
        "timestamp": timestamp if timestamp is not None else time.time(),
        "gpus": cards,
    }
    if cards:
        payload["status"] = "available"
    else:
        payload["status"] = "unavailable"
    return payload


def normalize_nvml_devices(
    devices: Optional[List[Dict[str, Any]]], timestamp: Optional[float] = None
) -> Dict[str, Any]:
    """Normalize pynvml device readings into the same shape as the ROCm normalizer.

    ``devices`` holds one plain dict per card (``index``, ``name``, ``gpu_utilization``,
    ``memory_utilization``, ``vram_used_bytes``, ``vram_total_bytes``, ``temp_edge_c``,
    ``power_watts``). Readings the driver refused to report may be ``None``.
    """
    cards: List[Dict[str, Any]] = []
    for position, device in enumerate(devices or []):
        card_id = device.get("index", position)
        cards.append(
            _build_gpu_record(
                card_id=f"card{card_id}",
                name=str(device.get("name") or f"NVIDIA GPU {card_id}"),
                gpu_utilization=_as_float(device.get("gpu_utilization")),
                vram_used_bytes=_as_float(device.get("vram_used_bytes")),
                vram_total_bytes=_as_float(device.get("vram_total_bytes")),
                temp_edge_c=_as_float(device.get("temp_edge_c")),
                power_watts=_as_float(device.get("power_watts")),
                memory_bandwidth_util=_as_float(device.get("memory_utilization")),
            )
        )

    return {
        "detected": bool(cards),
        "is_emulated": False,
        "driver": "CUDA NVML",
        "timestamp": timestamp if timestamp is not None else time.time(),
        "gpus": cards,
        "status": "available" if cards else "unavailable",
    }


class TelemetryProvider:
    """Synchronous provider that reads real telemetry when available."""

    def __init__(
        self,
        rocm_smi: Optional[Any] = None,
        cuda_reader: Optional[Callable[[], Any]] = None,
        timestamp_provider: Optional[Callable[[], float]] = None,
    ) -> None:
        self.rocm_smi = rocm_smi or _default_rocm_smi()
        self.cuda_reader = cuda_reader
        self.timestamp_provider = timestamp_provider or time.time

    def sample(self) -> Dict[str, Any]:
        """Return a truthful telemetry payload or an explicit unavailable state."""
        diagnostics: List[str] = []

        try:
            command_result = self.rocm_smi.run()
        except FileNotFoundError:
            command_result = None
        except Exception as exc:  # pragma: no cover - defensive fallback
            command_result = None
            diagnostics.append(f"rocm-smi-failure: {exc}")

        if command_result is not None:
            if command_result.returncode == 0 and command_result.stdout.strip():
                try:
                    payload = normalize_rocm_smi_json(command_result.stdout, timestamp=self.timestamp_provider())
                    return {
                        **payload,
                        "status": "available" if payload.get("gpus") else "unavailable",
                        "diagnostics": diagnostics,
                    }
                except ValueError as exc:
                    diagnostics.append(f"rocm-smi-invalid-json")
                    diagnostics.append(str(exc))
            elif command_result.stderr.strip():
                diagnostics.append(command_result.stderr.strip())

        if self.cuda_reader is not None:
            try:
                cuda_data = self.cuda_reader()
                if cuda_data is not None:
                    return {
                        "detected": True,
                        "is_emulated": False,
                        "driver": "CUDA",
                        "timestamp": self.timestamp_provider(),
                        "gpus": cuda_data,
                        "status": "available",
                        "diagnostics": diagnostics,
                    }
            except Exception as exc:  # pragma: no cover - defensive fallback
                diagnostics.append(f"cuda-reader-failure: {exc}")

        return {
            "detected": False,
            "is_emulated": False,
            "driver": "unavailable",
            "timestamp": self.timestamp_provider(),
            "gpus": [],
            "status": "unavailable",
            "diagnostics": diagnostics,
        }


class _DefaultRocmSmi:
    def run(self) -> RocmSmiCommandResult:
        result = subprocess.run(
            ["rocm-smi", "--showuse", "--showmeminfo", "vram", "--showtemp", "--json"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        return RocmSmiCommandResult(returncode=result.returncode, stdout=result.stdout, stderr=result.stderr)


def _default_rocm_smi() -> _DefaultRocmSmi:
    return _DefaultRocmSmi()


def parse_rocm_smi() -> Dict[str, Any]:
    """Compatibility wrapper for the older project API."""
    provider = TelemetryProvider()
    return provider.sample()
