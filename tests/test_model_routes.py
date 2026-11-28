from __future__ import annotations

import json
import struct
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import model_registry
from backend.database import initialize_database
from backend.routers import models as models_routes
from backend.security import create_access_token, get_current_user


def _gguf_string(value: str) -> bytes:
    data = value.encode("utf-8")
    return struct.pack("<Q", len(data)) + data


@pytest.fixture()
def api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    monkeypatch.setenv("MANDALA_MODELS_DIR", str(models_dir))
    db_path = tmp_path / "mandala.db"
    initialize_database(str(db_path))
    monkeypatch.setattr(models_routes, "DB_PATH", str(db_path))

    app = FastAPI()
    app.include_router(models_routes.router)
    app.dependency_overrides[get_current_user] = lambda: "admin"
    return TestClient(app), models_dir, db_path


def _make_model(models_dir: Path) -> None:
    directory = models_dir / "tiny-llm"
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
    (directory / "model.safetensors").write_bytes(b"\0" * 4096)


def test_routes_require_authentication(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    monkeypatch.setenv("MANDALA_MODELS_DIR", str(models_dir))
    db_path = tmp_path / "mandala.db"
    initialize_database(str(db_path))
    monkeypatch.setattr(models_routes, "DB_PATH", str(db_path))

    app = FastAPI()
    app.include_router(models_routes.router)
    client = TestClient(app)

    assert client.get("/api/v1/models").status_code == 401


def test_register_inspect_and_delete_flow(api) -> None:
    client, models_dir, _db_path = api
    _make_model(models_dir)

    assert client.get("/api/v1/models").json() == []

    inspect = client.post(
        "/api/v1/models/inspect",
        json={"source": {"kind": "local_path", "ref": "tiny-llm"}},
    )
    assert inspect.status_code == 200
    assert inspect.json()["metadata"]["architecture"] == "LlamaForCausalLM"

    created = client.post(
        "/api/v1/models",
        json={
            "source": {"kind": "local_path", "ref": "tiny-llm"},
            "display_name": "Tiny",
        },
    )
    assert created.status_code == 201
    record = created.json()
    assert record["state"] == "registered"
    assert record["display_name"] == "Tiny"

    assert [item["id"] for item in client.get("/api/v1/models").json()] == [record["id"]]
    assert client.get(f"/api/v1/models/{record['id']}").status_code == 200

    duplicate = client.post(
        "/api/v1/models",
        json={"source": {"kind": "local_path", "ref": "tiny-llm"}},
    )
    assert duplicate.status_code == 409

    deleted = client.delete(f"/api/v1/models/{record['id']}")
    assert deleted.status_code == 200
    assert client.get("/api/v1/models").json() == []


def test_inspect_rejects_unsafe_path(api, tmp_path: Path) -> None:
    client, _models_dir, _db_path = api
    outside = tmp_path / "outside"
    outside.mkdir()

    response = client.post(
        "/api/v1/models/inspect",
        json={"source": {"kind": "local_path", "ref": str(outside)}},
    )

    assert response.status_code == 422
    assert "inside" in response.json()["detail"]


def test_upload_accepts_gguf_magic_only(api) -> None:
    pytest.importorskip("python_multipart")
    client, models_dir, _db_path = api

    bad = client.post(
        "/api/v1/models/upload",
        files={"file": ("broken.gguf", b"not a gguf file", "application/octet-stream")},
    )
    assert bad.status_code == 422
    assert not (models_dir / "broken.gguf").exists()

    keys = [
        ("general.architecture", 8, _gguf_string("llama")),
        ("llama.context_length", 4, struct.pack("<I", 2048)),
    ]
    payload = b"".join(
        _gguf_string(key) + struct.pack("<I", value_type) + raw
        for key, value_type, raw in keys
    )
    body = (
        b"GGUF"
        + struct.pack("<I", 3)
        + struct.pack("<Q", 0)
        + struct.pack("<Q", len(keys))
        + payload
    )
    good = client.post(
        "/api/v1/models/upload",
        files={"file": ("tiny.gguf", body, "application/octet-stream")},
    )
    assert good.status_code == 201
    assert (models_dir / "tiny.gguf").read_bytes() == body

    inspect = client.post(
        "/api/v1/models/inspect",
        json={
            "source": {"kind": "gguf_upload", "ref": "tiny.gguf"},
            "plan": {"engine": "llama_cpp"},
        },
    )
    assert inspect.status_code == 200
    assert inspect.json()["metadata"]["architecture"] == "llama"
