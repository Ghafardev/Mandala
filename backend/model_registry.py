"""Mandala model registry.

This module owns everything that happens **before** inference:

* validate a model source (Hugging Face repo id, local directory, uploaded GGUF),
* inspect *real* metadata (``config.json``, safetensors sizes, GGUF header, HF API),
* estimate VRAM from an explicit, explainable formula,
* persist the registration in SQLite.

It deliberately does not download weights, load a model, or generate tokens.
A registered model is metadata only; ``state`` stays ``registered``.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import struct
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODELS_DIR = PROJECT_ROOT / "models"

SourceKind = Literal["huggingface", "local_path", "gguf_upload"]
Engine = Literal["transformers", "llama_cpp", "vllm"]
DType = Literal["bfloat16", "float16", "float32"]
Quantization = Literal["none", "int8", "int4"]

DTYPE_BYTES: dict[str, float] = {"bfloat16": 2.0, "float16": 2.0, "float32": 4.0}
QUANT_BYTES: dict[str, float] = {"none": 0.0, "int8": 1.0, "int4": 0.5}
GGUF_QUANT_BYTES: dict[str, float] = {
    "q2_k": 0.3125,
    "q3_k": 0.4375,
    "q4_0": 0.5625,
    "q4_k": 0.5625,
    "q5_k": 0.6875,
    "q6_k": 0.8125,
    "q8_0": 1.0625,
    "f16": 2.0,
    "bf16": 2.0,
    "f32": 4.0,
}

HF_REPO_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")
MODEL_FILE_SUFFIXES = (".safetensors", ".bin", ".gguf", ".pt", ".pth")


class ModelSourceError(ValueError):
    """A source the registry refuses to accept, with a user-readable reason."""


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
def models_dir() -> Path:
    """Return the only directory the registry may read/write model files in."""
    configured = os.getenv("MANDALA_MODELS_DIR", str(DEFAULT_MODELS_DIR))
    root = Path(configured).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def max_upload_bytes() -> int:
    gigabytes = float(os.getenv("MANDALA_MAX_MODEL_UPLOAD_GB", "20"))
    return int(gigabytes * 1024**3)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------
class ModelSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: SourceKind
    ref: str = Field(min_length=1, max_length=1024)
    revision: str | None = Field(default=None, max_length=200)
    # Accepted for Hugging Face authentication only; never persisted.
    token: str | None = Field(default=None, max_length=4096, exclude=True)


class RuntimePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    engine: Engine = "transformers"
    dtype: DType = "bfloat16"
    quantization: Quantization = "none"
    max_context: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_engine_plan(self) -> "RuntimePlan":
        if self.engine == "llama_cpp":
            if self.quantization != "none":
                raise ValueError(
                    "llama.cpp uses the GGUF file's own quantization; set quantization to none."
                )
            self.dtype = "float16"
        if self.engine == "transformers" and self.quantization != "none" and self.dtype != "float16":
            raise ValueError("4-bit and 8-bit loading require dtype float16.")
        return self


class InspectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: ModelSource
    plan: RuntimePlan = Field(default_factory=RuntimePlan)


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: ModelSource
    display_name: str | None = Field(default=None, max_length=200)
    plan: RuntimePlan = Field(default_factory=RuntimePlan)


class ModelMetadata(BaseModel):
    source_kind: SourceKind
    source_ref: str
    display_name: str
    architecture: str | None = None
    params_billions: float | None = None
    params_estimated_from: Literal["weights", "config", "gguf_file_size"] | None = None
    context_length: int | None = None
    layers: int | None = None
    hidden_size: int | None = None
    kv_heads: int | None = None
    head_dim: int | None = None
    torch_dtype: str | None = None
    quantization: str | None = None
    files: list[str] = Field(default_factory=list)


class VramEstimate(BaseModel):
    weights_gb: float
    kv_cache_gb: float
    overhead_gb: float
    total_gb: float
    bytes_per_param: float
    engine: Engine
    dtype: DType
    quantization: Quantization
    formula: str
    available_gb: float | None = None
    verdict: Literal["fits", "insufficient", "unknown"]


class InspectResult(BaseModel):
    metadata: ModelMetadata
    plan: RuntimePlan
    estimate: VramEstimate


class ModelRecord(BaseModel):
    id: str
    display_name: str
    source_kind: SourceKind
    source_ref: str
    architecture: str | None = None
    params_billions: float | None = None
    context_length: int | None = None
    torch_dtype: str | None = None
    quantization: str | None = None
    engine: str
    est_vram_gb: float | None = None
    state: str
    last_error: str | None = None
    last_used_at: str | None = None
    created_at: str | None = None


# ---------------------------------------------------------------------------
# Source validation
# ---------------------------------------------------------------------------
def resolve_local_source(source: ModelSource) -> Path:
    """Return the allow-listed on-disk path for a local/uploaded source.

    Relative references resolve inside ``models_dir``; absolute paths are only
    accepted when they already live under it. Nothing outside it is ever read.
    """
    if source.kind == "huggingface":
        raise ModelSourceError("Hugging Face sources are not on disk.")

    root = models_dir()
    if source.kind == "gguf_upload":
        if "/" in source.ref or "\\" in source.ref or source.ref in {".", ".."}:
            raise ModelSourceError("Uploaded models are addressed by file name only.")
        candidate = (root / source.ref).resolve()
    else:
        raw = Path(source.ref).expanduser()
        candidate = (raw if raw.is_absolute() else root / raw).resolve()

    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise ModelSourceError(
            f"Model path must stay inside {root}."
        ) from error

    if not candidate.exists():
        raise ModelSourceError(f"Model path does not exist: {candidate}")

    if source.kind == "gguf_upload":
        if candidate.suffix.lower() != ".gguf" or not candidate.is_file():
            raise ModelSourceError("An uploaded model must be a .gguf file.")
    elif candidate.is_dir():
        if not (candidate / "config.json").is_file() and not _has_weights(candidate):
            raise ModelSourceError(
                "Directory must contain config.json or model weight files."
            )
    elif candidate.suffix.lower() != ".gguf":
        raise ModelSourceError("A file source must be a .gguf model file.")

    return candidate


def _has_weights(directory: Path) -> bool:
    return any(
        path.suffix.lower() in MODEL_FILE_SUFFIXES
        for path in directory.iterdir()
        if path.is_file()
    )


def validate_huggingface_source(source: ModelSource) -> None:
    if source.kind != "huggingface":
        return
    if not HF_REPO_ID.match(source.ref):
        raise ModelSourceError(
            "Hugging Face source must be a repo id such as Qwen/Qwen2.5-7B-Instruct."
        )


# ---------------------------------------------------------------------------
# Real metadata inspection
# ---------------------------------------------------------------------------
def inspect_source(source: ModelSource, plan: RuntimePlan | None = None) -> InspectResult:
    active_plan = plan or RuntimePlan()
    if source.kind == "huggingface":
        metadata = _inspect_huggingface(source)
    else:
        path = resolve_local_source(source)
        metadata = (
            _inspect_gguf(path, source.kind)
            if path.suffix.lower() == ".gguf"
            else _inspect_directory(path)
        )

    if active_plan.engine == "llama_cpp" and not metadata.source_ref.lower().endswith(".gguf") and source.kind != "huggingface":
        raise ModelSourceError("llama.cpp requires a single .gguf file source.")

    estimate = estimate_vram(metadata, active_plan)
    return InspectResult(metadata=metadata, plan=active_plan, estimate=estimate)


def _inspect_directory(directory: Path) -> ModelMetadata:
    config_path = directory / "config.json"
    if not config_path.is_file():
        raise ModelSourceError(f"Missing config.json in {directory}.")

    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ModelSourceError(f"config.json is not readable JSON: {error}") from error
    if not isinstance(config, dict):
        raise ModelSourceError("config.json must contain a JSON object.")

    layers = _as_int(config.get("num_hidden_layers"))
    hidden_size = _as_int(config.get("hidden_size"))
    heads = _as_int(config.get("num_attention_heads"))
    kv_heads = _as_int(config.get("num_key_value_heads")) or heads
    head_dim = _as_int(config.get("head_dim"))
    if not head_dim and hidden_size and heads:
        head_dim = max(1, hidden_size // heads)
    context_length = _as_int(
        config.get("max_position_embeddings") or config.get("max_sequence_length")
    )

    architectures = config.get("architectures")
    architecture = (
        architectures[0]
        if isinstance(architectures, list) and architectures and isinstance(architectures[0], str)
        else config.get("model_type") if isinstance(config.get("model_type"), str) else None
    )

    torch_dtype = config.get("torch_dtype")
    if not isinstance(torch_dtype, str):
        torch_dtype = None

    quantization_config = config.get("quantization_config")
    quantization = "none"
    if isinstance(quantization_config, dict):
        bits = _as_int(quantization_config.get("bits"))
        quantization = {4: "int4", 8: "int8"}.get(bits or 0, "none")

    weight_bytes = 0
    files: list[str] = []
    for path in sorted(directory.iterdir()):
        if path.is_file() and path.suffix.lower() in MODEL_FILE_SUFFIXES:
            files.append(path.name)
            weight_bytes += path.stat().st_size

    weight_bytes_per_param = DTYPE_BYTES.get(torch_dtype or "bfloat16", 2.0)
    if weight_bytes > 0:
        params_billions = weight_bytes / weight_bytes_per_param / 1e9
        estimated_from: Literal["weights", "config"] = "weights"
    elif hidden_size and layers:
        vocab = _as_int(config.get("vocab_size")) or 32_000
        params = vocab * hidden_size + layers * 12 * hidden_size**2
        params_billions = params / 1e9
        estimated_from = "config"
    else:
        params_billions = None
        estimated_from = None

    return ModelMetadata(
        source_kind="local_path",
        source_ref=str(directory),
        display_name=directory.name,
        architecture=architecture,
        params_billions=_round_params(params_billions),
        params_estimated_from=estimated_from,
        context_length=context_length,
        layers=layers,
        hidden_size=hidden_size,
        kv_heads=kv_heads,
        head_dim=head_dim,
        torch_dtype=torch_dtype,
        quantization=quantization,
        files=files[:50],
    )


GGUF_MAGIC = b"GGUF"
_GGUF_SCALAR = {
    0: ("<B", 1),   # uint8
    1: ("<b", 1),   # int8
    2: ("<H", 2),   # uint16
    3: ("<h", 2),   # int16
    4: ("<I", 4),   # uint32
    5: ("<i", 4),   # int32
    6: ("<f", 4),   # float32
    7: ("<?", 1),   # bool
    10: ("<Q", 8),  # uint64
    11: ("<q", 8),  # int64
    12: ("<d", 8),  # float64
}


def _read_gguf_string(handle: Any, max_length: int = 1_000_000) -> str | None:
    raw = handle.read(8)
    if len(raw) != 8:
        return None
    (length,) = struct.unpack("<Q", raw)
    if length > max_length:
        return None
    data = handle.read(length)
    if len(data) != length:
        return None
    return data.decode("utf-8", errors="replace")


def _read_gguf_metadata(path: Path) -> dict[str, Any]:
    """Read scalar GGUF metadata keys.

    Stops at the first array value (tokenizer vocabularies are arrays and are not
    needed for the model card), returning the keys collected so far.
    """
    metadata: dict[str, Any] = {}
    with path.open("rb") as handle:
        if handle.read(4) != GGUF_MAGIC:
            raise ModelSourceError("File does not start with the GGUF magic bytes.")
        version = struct.unpack("<I", handle.read(4))[0]
        if version not in (1, 2, 3):
            raise ModelSourceError(f"Unsupported GGUF version {version}.")
        struct.unpack("<Q", handle.read(8))  # tensor count
        kv_count = struct.unpack("<Q", handle.read(8))[0]

        for _ in range(min(kv_count, 4096)):
            key = _read_gguf_string(handle)
            if key is None:
                break
            raw_type = handle.read(4)
            if len(raw_type) != 4:
                break
            value_type = struct.unpack("<I", raw_type)[0]

            if value_type == 8:  # string
                value = _read_gguf_string(handle)
                if value is None:
                    break
                metadata[key] = value
                continue

            if value_type == 9:  # array
                break

            scalar = _GGUF_SCALAR.get(value_type)
            if scalar is None:
                break
            fmt, size = scalar
            data = handle.read(size)
            if len(data) != size:
                break
            metadata[key] = struct.unpack(fmt, data)[0]

    return metadata


def _gguf_quantization(filename: str) -> str:
    lowered = filename.lower()
    for name in sorted(GGUF_QUANT_BYTES, key=len, reverse=True):
        if re.search(rf"[._-]{name}([._-]|$)", lowered):
            return name
    return "unknown"


def _inspect_gguf(path: Path, source_kind: SourceKind = "local_path") -> ModelMetadata:
    if not path.is_file():
        raise ModelSourceError(f"GGUF model does not exist: {path}")
    metadata = _read_gguf_metadata(path)

    architecture = metadata.get("general.architecture")
    if not isinstance(architecture, str):
        architecture = None
    prefix = architecture or ""

    def value(suffix: str) -> Any:
        return metadata.get(f"{prefix}.{suffix}") if prefix else None

    layers = _as_int(value("block_count"))
    hidden_size = _as_int(value("embedding_length"))
    heads = _as_int(value("attention.head_count"))
    kv_heads = _as_int(value("attention.head_count_kv")) or heads
    head_dim = max(1, hidden_size // heads) if hidden_size and heads else None
    context_length = _as_int(value("context_length"))

    quantization = _gguf_quantization(path.name)
    bytes_per_param = GGUF_QUANT_BYTES.get(quantization, 2.0)
    params_billions = path.stat().st_size / bytes_per_param / 1e9

    display_name = metadata.get("general.name")
    if not isinstance(display_name, str) or not display_name:
        display_name = path.stem

    return ModelMetadata(
        source_kind=source_kind,
        source_ref=str(path),
        display_name=display_name,
        architecture=architecture,
        params_billions=_round_params(params_billions),
        params_estimated_from="gguf_file_size",
        context_length=context_length,
        layers=layers,
        hidden_size=hidden_size,
        kv_heads=kv_heads,
        head_dim=head_dim,
        torch_dtype="float16",
        quantization=quantization,
        files=[path.name],
    )


def _inspect_huggingface(source: ModelSource) -> ModelMetadata:
    validate_huggingface_source(source)
    url = f"https://huggingface.co/api/models/{source.ref}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    if source.token:
        request.add_header("Authorization", f"Bearer {source.token}")
    if source.revision:
        request.add_header("X-Revision", source.revision)

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        raise ModelSourceError(
            f"Could not read {source.ref} from the Hugging Face API: {error}"
        ) from error

    if not isinstance(payload, dict):
        raise ModelSourceError("Hugging Face returned an unexpected payload.")

    config = payload.get("config") if isinstance(payload.get("config"), dict) else {}
    architectures = config.get("architectures")
    architecture = (
        architectures[0]
        if isinstance(architectures, list) and architectures and isinstance(architectures[0], str)
        else config.get("model_type") if isinstance(config.get("model_type"), str) else None
    )

    safetensors = payload.get("safetensors")
    total = _as_int(safetensors.get("total")) if isinstance(safetensors, dict) else None
    params_billions = total / 1e9 if total else None
    estimated_from: Literal["weights", "config"] | None = "weights" if total else None

    siblings = payload.get("siblings")
    files = [
        entry["rfilename"]
        for entry in siblings
        if isinstance(entry, dict) and isinstance(entry.get("rfilename"), str)
    ][:50] if isinstance(siblings, list) else []

    torch_dtype = config.get("torch_dtype")
    if not isinstance(torch_dtype, str):
        torch_dtype = None

    return ModelMetadata(
        source_kind="huggingface",
        source_ref=source.ref,
        display_name=source.ref.split("/")[-1],
        architecture=architecture,
        params_billions=_round_params(params_billions),
        params_estimated_from=estimated_from,
        context_length=_as_int(config.get("max_position_embeddings")),
        torch_dtype=torch_dtype,
        files=files,
    )


# ---------------------------------------------------------------------------
# VRAM estimate
# ---------------------------------------------------------------------------
def estimate_vram(metadata: ModelMetadata, plan: RuntimePlan) -> VramEstimate:
    if plan.engine == "llama_cpp":
        bytes_per_param = GGUF_QUANT_BYTES.get(metadata.quantization or "unknown", 2.0)
    else:
        bytes_per_param = QUANT_BYTES[plan.quantization] if plan.quantization != "none" else DTYPE_BYTES[plan.dtype]

    params = metadata.params_billions or 0.0
    weights_gb = params * bytes_per_param

    context = plan.max_context or metadata.context_length or 0
    if metadata.layers and metadata.kv_heads and metadata.head_dim and context and plan.engine != "llama_cpp":
        kv_cache_gb = (
            2
            * metadata.layers
            * metadata.kv_heads
            * metadata.head_dim
            * context
            * DTYPE_BYTES[plan.dtype]
            / 1e9
        )
    else:
        kv_cache_gb = 0.0

    overhead_gb = 0.20 * (weights_gb + kv_cache_gb)
    total_gb = weights_gb + kv_cache_gb + overhead_gb

    available_gb = _gpu_free_gb()
    if available_gb is None:
        verdict: Literal["fits", "insufficient", "unknown"] = "unknown"
    elif total_gb <= available_gb * 0.9:
        verdict = "fits"
    else:
        verdict = "insufficient"

    formula = (
        f"weights = {params:.3f}B params x {bytes_per_param} bytes/param = {weights_gb:.2f} GB; "
        f"kv = 2 x {metadata.layers or 0} layers x {metadata.kv_heads or 0} kv_heads x "
        f"{metadata.head_dim or 0} head_dim x {context} ctx x "
        f"{DTYPE_BYTES[plan.dtype]} bytes = {kv_cache_gb:.2f} GB; "
        f"overhead = 20% = {overhead_gb:.2f} GB; total = {total_gb:.2f} GB"
    )

    return VramEstimate(
        weights_gb=_round(weights_gb) or 0.0,
        kv_cache_gb=_round(kv_cache_gb) or 0.0,
        overhead_gb=_round(overhead_gb) or 0.0,
        total_gb=_round(total_gb) or 0.0,
        bytes_per_param=bytes_per_param,
        engine=plan.engine,
        dtype=plan.dtype,
        quantization=plan.quantization,
        formula=formula,
        available_gb=_round(available_gb),
        verdict=verdict,
    )


def _gpu_free_gb() -> float | None:
    try:
        import torch

        if not torch.cuda.is_available():
            return None
        free_bytes, _total_bytes = torch.cuda.mem_get_info()
        return free_bytes / 1e9
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Registry persistence (SQLite)
# ---------------------------------------------------------------------------
def _connect(db_path: str) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection


def list_models(db_path: str) -> list[ModelRecord]:
    with _connect(db_path) as connection:
        rows = connection.execute(
            "SELECT * FROM models ORDER BY created_at DESC"
        ).fetchall()
    return [ModelRecord.model_validate(dict(row)) for row in rows]


def get_model(db_path: str, model_id: str) -> ModelRecord | None:
    with _connect(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM models WHERE id = ?", (model_id,)
        ).fetchone()
    return ModelRecord.model_validate(dict(row)) if row else None


def create_model(db_path: str, request: RegisterRequest) -> ModelRecord:
    inspection = inspect_source(request.source, request.plan)
    metadata = inspection.metadata
    source = request.source

    if source.kind == "huggingface":
        source_ref = source.ref
    else:
        path = resolve_local_source(source)
        source_ref = str(path)

    display_name = (request.display_name or metadata.display_name).strip()
    if not display_name:
        raise ModelSourceError("A display name is required.")

    record_id = str(uuid.uuid4())
    try:
        with _connect(db_path) as connection:
            connection.execute(
                """
                INSERT INTO models (
                    id, display_name, source_kind, source_ref, architecture,
                    params_billions, context_length, torch_dtype, quantization,
                    engine, est_vram_gb, state
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered')
                """,
                (
                    record_id,
                    display_name,
                    source.kind,
                    source_ref,
                    metadata.architecture,
                    metadata.params_billions,
                    metadata.context_length,
                    metadata.torch_dtype,
                    metadata.quantization,
                    request.plan.engine,
                    inspection.estimate.total_gb,
                ),
            )
            connection.execute(
                """
                INSERT INTO task_history (
                    id, task_type, input_source, output_artifact,
                    execution_mode, status, execution_time_ms, telemetry_json
                ) VALUES (?, 'MODEL_REGISTER', ?, ?, ?, 'SUCCESS', 0, ?)
                """,
                (
                    str(uuid.uuid4()),
                    f"{source.kind}:{source_ref}",
                    f"Registered model {display_name}",
                    request.plan.engine,
                    json.dumps(
                        {
                            "architecture": metadata.architecture,
                            "params_billions": metadata.params_billions,
                            "est_vram_gb": inspection.estimate.total_gb,
                            "quantization": request.plan.quantization,
                        }
                    ),
                ),
            )
            connection.commit()
    except sqlite3.IntegrityError as error:
        raise ModelSourceError(
            "That model source is already registered."
        ) from error

    record = get_model(db_path, record_id)
    assert record is not None
    return record


def delete_model(db_path: str, model_id: str) -> ModelRecord:
    record = get_model(db_path, model_id)
    if record is None:
        raise KeyError(model_id)
    if record.state in {"loading", "ready", "unloading"}:
        raise ModelSourceError("Unload the model before deleting it.")

    with _connect(db_path) as connection:
        connection.execute("DELETE FROM models WHERE id = ?", (model_id,))
        connection.commit()

    if record.source_kind == "gguf_upload":
        path = Path(record.source_ref)
        if path.is_file():
            try:
                path.relative_to(models_dir())
                path.unlink()
            except ValueError:
                pass
    return record


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _round(value: float | None) -> float | None:
    return round(value, 4) if value is not None else None


def _round_params(value: float | None) -> float | None:
    # Billions of parameters: keep six decimals so a tiny test fixture is not
    # silently rounded to zero, while real models still read cleanly.
    return round(value, 6) if value is not None else None
