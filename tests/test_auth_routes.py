from __future__ import annotations

from pathlib import Path
from typing import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.database import initialize_database
from backend.routers import auth as auth_module
from backend.routers import task as task_module

ADMIN = {"username": "admin", "password": "correct-horse"}


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    db_path = tmp_path / "auth-test.db"
    initialize_database(str(db_path))
    monkeypatch.setattr(auth_module, "DB_PATH", str(db_path))
    monkeypatch.setattr(task_module, "DB_PATH", str(db_path))

    app = FastAPI()
    app.include_router(auth_module.router)
    app.include_router(task_module.task_router)

    with TestClient(app) as test_client:
        yield test_client


def test_status_on_fresh_database(client: TestClient) -> None:
    response = client.get("/api/auth/status")

    assert response.status_code == 200
    assert response.json() == {
        "is_setup_completed": False,
        "requires_onboarding": True,
    }


def test_setup_creates_admin_and_session(client: TestClient) -> None:
    response = client.post("/api/auth/setup", json=ADMIN)

    assert response.status_code == 201
    assert response.json()["username"] == "admin"
    assert response.cookies.get("mandala_session")
    assert client.get("/api/auth/me").status_code == 200


def test_duplicate_setup_is_rejected(client: TestClient) -> None:
    assert client.post("/api/auth/setup", json=ADMIN).status_code == 201

    response = client.post("/api/auth/setup", json=ADMIN)

    assert response.status_code == 400


def test_setup_rejects_short_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/setup",
        json={"username": "admin", "password": "short"},
    )

    assert response.status_code == 422


def test_login_rejects_bad_password_and_accepts_good_password(
    client: TestClient,
) -> None:
    assert client.post("/api/auth/setup", json=ADMIN).status_code == 201
    client.cookies.clear()

    bad = client.post(
        "/api/auth/login",
        json={"username": ADMIN["username"], "password": "wrong-password"},
    )
    assert bad.status_code == 401

    good = client.post("/api/auth/login", json=ADMIN)
    assert good.status_code == 200
    assert good.cookies.get("mandala_session")


def test_me_requires_session(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_logout_invalidates_session(client: TestClient) -> None:
    assert client.post("/api/auth/setup", json=ADMIN).status_code == 201

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_task_history_requires_session_and_returns_list(client: TestClient) -> None:
    assert client.get("/api/tasks/history").status_code == 401

    assert client.post("/api/auth/setup", json=ADMIN).status_code == 201
    response = client.get("/api/tasks/history")

    assert response.status_code == 200
    assert response.json() == []
