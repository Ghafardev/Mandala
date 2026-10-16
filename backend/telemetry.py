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
            card_name = str(card_data.get("Card series") or card_key)
            vram_total_bytes = float(card_data.get("VRAM Total Memory (B)", 0) or 0)
            vram_used_bytes = float(card_data.get("VRAM Total Used Memory (B)", 0) or 0)
            gpu_util = float(card_data.get("GPU use (%)", 0) or 0)
            temp_edge = float(card_data.get("Temperature (Sensor edge) (C)", 0) or 0)
            power_watts = float(card_data.get("Average Graphics Package Power (W)", 0) or 0)

            vram_total_gb = vram_total_bytes / (1024 ** 3)
            vram_used_gb = vram_used_bytes / (1024 ** 3)
            vram_percent = (vram_used_gb / vram_total_gb * 100.0) if vram_total_gb > 0 else 0.0

            cards.append(
                {
                    "id": str(card_key),
                    "name": card_name,
                    "arch": "",
                    "compute_units": 0,
                    "stream_processors": 0,
                    "matrix_cores": "",
                    "vram_used_gb": round(vram_used_gb, 2),
                    "vram_total_gb": round(vram_total_gb, 2),
                    "vram_percent": round(vram_percent, 1),
                    "gpu_utilization": round(gpu_util, 1),
                    "memory_bandwidth_util": 0.0,
                    "hbm_peak_bandwidth_tbs": 0.0,
                    "temp_edge_c": round(temp_edge, 1),
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
