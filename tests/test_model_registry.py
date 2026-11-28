from __future__ import annotations

import json
import sqlite3
import struct
from pathlib import Path

import pytest

from backend import model_registry as registry
from backend.database import initialize_database
from backend.model_registry import (
    ModelMetadata,
    ModelSource,
    ModelSourceError,
    RegisterRequest,
    RuntimePlan,
    inspect_source,
)


@pytest.fixture()
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    models = tmp_path / "models"
    models.mkdir()
    monkeypatch.setenv("MANDALA_MODELS_DIR", str(models))
    db_path = tmp_path / "mandala.db"
    initialize_database(str(db_path))
    monkeypatch.setattr(registry, "DB_PATH", str(db_path), raising=False)
    return models


def make_local_model(root: Path, name: str = "tiny-llm") -> Path:
    directory = root / name
    directory.mkdir()
    (directory / "config.json").write_text(
        json.dumps(
            {
                "architectures": ["LlamaForCausalLM"],
                "num_hidden_layers": 4,
                "hidden_size": 64,
                "num_attention_heads": 4,
                "num_key_value_heads": 2,
                "max_position_embeddings": 2048,
                "torch_dtype": "bfloat16",
            }
        ),
        encoding="utf-8",
    )
    (directory / "model.safetensors").write_bytes(b"\0" * 10_000)
    return directory


def _gguf_string(value: str) -> bytes:
    data = value.encode("utf-8")
    return struct.pack("<Q", len(data)) + data


def make_gguf(path: Path, context_length: int = 4096) -> Path:
    keys = [
        ("general.architecture", 8, _gguf_string("llama")),
        ("general.name", 8, _gguf_string("Tiny GGUF")),
        ("llama.context_length", 4, struct.pack("<I", context_length)),
        ("llama.block_count", 4, struct.pack("<I", 8)),
        ("llama.embedding_length", 4, struct.pack("<I", 256)),
        ("llama.attention.head_count", 4, struct.pack("<I", 8)),
        ("llama.attention.head_count_kv", 4, struct.pack("<I", 2)),
    ]
    payload = b"".join(
        _gguf_string(key) + struct.pack("<I", value_type) + raw
        for key, value_type, raw in keys
    )
    path.write_bytes(
        b"GGUF"
        + struct.pack("<I", 3)
        + struct.pack("<Q", 0)
        + struct.pack("<Q", len(keys))
        + payload
    )
    return path


def test_inspect_local_directory_reports_real_config(workspace: Path) -> None:
    make_local_model(workspace)

    result = inspect_source(ModelSource(kind="local_path", ref="tiny-llm"))

    assert result.metadata.architecture == "LlamaForCausalLM"
    assert result.metadata.layers == 4
    assert result.metadata.kv_heads == 2
    assert result.metadata.head_dim == 16
    assert result.metadata.context_length == 2048
    assert result.metadata.params_estimated_from == "weights"
    assert result.metadata.params_billions == pytest.approx(10_000 / 2 / 1e9)
    assert result.estimate.total_gb > 0
    assert "weights" in result.estimate.formula


def test_inspect_rejects_paths_outside_models_dir(
    workspace: Path, tmp_path: Path
) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()

    with pytest.raises(ModelSourceError, match="inside"):
        inspect_source(ModelSource(kind="local_path", ref=str(outside)))


def test_inspect_rejects_missing_local_model(workspace: Path) -> None:
    with pytest.raises(ModelSourceError, match="does not exist"):
        inspect_source(ModelSource(kind="local_path", ref="nope"))


def test_inspect_gguf_reads_header_metadata(workspace: Path) -> None:
    make_gguf(workspace / "tiny-q4_k_m.gguf")

    result = inspect_source(
        ModelSource(kind="gguf_upload", ref="tiny-q4_k_m.gguf"),
        RuntimePlan(engine="llama_cpp"),
    )

    assert result.metadata.architecture == "llama"
    assert result.metadata.display_name == "Tiny GGUF"
    assert result.metadata.context_length == 4096
    assert result.metadata.layers == 8
    assert result.metadata.quantization == "q4_k"
    assert result.metadata.params_estimated_from == "gguf_file_size"
    assert result.estimate.bytes_per_param == pytest.approx(0.5625)


def test_inspect_rejects_non_gguf_upload(workspace: Path) -> None:
    (workspace / "weights.bin").write_bytes(b"\0")

    with pytest.raises(ModelSourceError, match="gguf"):
        inspect_source(ModelSource(kind="gguf_upload", ref="weights.bin"))


def test_vram_estimate_is_explainable() -> None:
    metadata = ModelMetadata(
        source_kind="local_path",
        source_ref="/models/7b",
        display_name="7B",
        params_billions=7.0,
        layers=32,
        kv_heads=8,
        head_dim=128,
        context_length=4096,
    )

    estimate = registry.estimate_vram(metadata, RuntimePlan())

    expected_kv = 2 * 32 * 8 * 128 * 4096 * 2 / 1e9
    expected_total = 14.0 + expected_kv + 0.2 * (14.0 + expected_kv)
    assert estimate.weights_gb == pytest.approx(14.0)
    assert estimate.kv_cache_gb == pytest.approx(expected_kv, rel=1e-3)
    assert estimate.total_gb == pytest.approx(expected_total, rel=1e-3)
    assert estimate.verdict in {"unknown", "fits", "insufficient"}


def test_create_list_and_delete_model(workspace: Path) -> None:
    make_local_model(workspace)
    db_path = str(workspace.parent / "mandala.db")
    request = RegisterRequest(
        source=ModelSource(kind="local_path", ref="tiny-llm"),
        display_name="Tiny Local",
    )

    record = registry.create_model(db_path, request)

    assert record.display_name == "Tiny Local"
    assert record.state == "registered"
    assert record.engine == "transformers"
    assert registry.list_models(db_path) == [record]

    with sqlite3.connect(db_path) as connection:
        task_types = [
            row[0]
            for row in connection.execute(
                "SELECT task_type FROM task_history WHERE task_type = 'MODEL_REGISTER'"
            )
        ]
    assert task_types == ["MODEL_REGISTER"]

    with pytest.raises(ModelSourceError, match="already registered"):
        registry.create_model(db_path, request)

    registry.delete_model(db_path, record.id)
    assert registry.list_models(db_path) == []


def test_delete_uploaded_gguf_removes_the_file(workspace: Path) -> None:
    make_gguf(workspace / "tiny.gguf")
    db_path = str(workspace.parent / "mandala.db")
    record = registry.create_model(
        db_path,
        RegisterRequest(
            source=ModelSource(kind="gguf_upload", ref="tiny.gguf"),
            plan=RuntimePlan(engine="llama_cpp"),
        ),
    )

    registry.delete_model(db_path, record.id)

    assert not (workspace / "tiny.gguf").exists()


def test_llama_cpp_rejects_directory_source(workspace: Path) -> None:
    make_local_model(workspace)

    with pytest.raises(ModelSourceError, match=".gguf"):
        inspect_source(
            ModelSource(kind="local_path", ref="tiny-llm"),
            RuntimePlan(engine="llama_cpp"),
        )
