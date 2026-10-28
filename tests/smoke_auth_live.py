from __future__ import annotations

import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

PORT = 8123
BASE_URL = f"http://127.0.0.1:{PORT}"
REPO_ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_DIR = REPO_ROOT / ".omo" / "evidence"
SERVER_LOG = EVIDENCE_DIR / "task-5-fix-auth-router-mounting-server.log"

ADMIN = {"username": "admin", "password": "correct-horse"}


def assert_port_free() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        if sock.connect_ex(("127.0.0.1", PORT)) == 0:
            raise RuntimeError(
                f"Port {PORT} is already in use; stop the existing server first."
            )


def wait_for_server(client: httpx.Client) -> None:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            response = client.get(f"{BASE_URL}/api/auth/status", timeout=2.0)
            if response.status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    raise RuntimeError("Server did not become ready within 60s.")


def run_flow(client: httpx.Client) -> None:
    status = client.get(f"{BASE_URL}/api/auth/status")
    assert status.status_code == 200, status.text
    assert status.json()["requires_onboarding"] is True, status.text

    setup = client.post(f"{BASE_URL}/api/auth/setup", json=ADMIN)
    assert setup.status_code == 201, setup.text
    assert client.cookies.get("mandala_session"), "session cookie was not set"

    status = client.get(f"{BASE_URL}/api/auth/status")
    assert status.json()["is_setup_completed"] is True, status.text

    me = client.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 200, me.text

    tasks = client.get(f"{BASE_URL}/api/tasks/history")
    assert tasks.status_code == 200, tasks.text
    assert tasks.json() == [], tasks.text

    logout = client.post(f"{BASE_URL}/api/auth/logout")
    assert logout.status_code == 200, logout.text

    me = client.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 401, me.text

    bad_login = client.post(
        f"{BASE_URL}/api/auth/login",
        json={**ADMIN, "password": "wrong-password"},
    )
    assert bad_login.status_code == 401, bad_login.text

    good_login = client.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    assert good_login.status_code == 200, good_login.text


def main() -> int:
    assert_port_free()
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

    db_path = Path(tempfile.mkdtemp(prefix="mandala-smoke-")) / "mandala.db"
    env = {
        **os.environ,
        "MANDALA_DB_PATH": str(db_path),
        "MANDALA_PORT": str(PORT),
    }

    with SERVER_LOG.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            [sys.executable, "main-api.py"],
            cwd=REPO_ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        assert process.stdout is not None

        error: Exception | None = None
        try:
            with httpx.Client(timeout=10.0) as client:
                wait_for_server(client)
                run_flow(client)
        except Exception as exc:
            error = exc
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            output = process.stdout.read()
            log.write(output)
            log.flush()

    if error is not None:
        print(output)
        raise error

    time.sleep(0.5)
    assert_port_free()
    print("LIVE AUTH SMOKE: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
