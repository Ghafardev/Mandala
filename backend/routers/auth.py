"""
Mandala Authentication Router
=============================
Endpoints consumed by ``src/pages/Setup.tsx``, ``src/pages/Login.tsx`` and
``src/components/AuthGuard.tsx``.

* ``GET  /api/auth/status`` -> first-run onboarding detection.
* ``POST /api/auth/setup``  -> create the single local administrator (once only).
* ``POST /api/auth/login``  -> verify credentials and issue the session cookie.
* ``GET  /api/auth/me``     -> resolve the cookie-backed session (guard probe).
* ``POST /api/auth/logout`` -> destroy the session cookie.

The session is a JWT stored in the HTTP-Only, SameSite=Strict ``mandala_session``
cookie, so the browser can never read it from JavaScript.
"""

from __future__ import annotations

import sqlite3
from typing import Literal

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from security import (
    DB_PATH,
    SESSION_COOKIE_MAX_AGE,
    SESSION_COOKIE_NAME,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication & Setup"])

SESSION_COOKIE_PATH = "/"
DEFAULT_ROCM_PATH = "/opt/rocm"
DEFAULT_VOICE_CHARACTER = "koji_engineer"


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class SetupRequest(BaseModel):
    """Payload for the one-time local administrator onboarding."""

    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    rocm_path: str = Field(default=DEFAULT_ROCM_PATH, max_length=512)
    voice_character: Literal["koji_engineer", "koji_guide"] = DEFAULT_VOICE_CHARACTER


class LoginRequest(BaseModel):
    """Payload for the local administrator login form."""

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _set_session_cookie(response: Response, username: str) -> str:
    """
    Issue a fresh 24h JWT and attach it as the ``mandala_session`` cookie.

    ``secure=False`` is intentional: Mandala is a local-first desktop IDE served
    over ``http://localhost``. Enable it (or set MANDALA_COOKIE_SECURE=1) once
    the dashboard is exposed through HTTPS.
    """
    token = create_access_token({"sub": username})
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_COOKIE_MAX_AGE,
        path=SESSION_COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=False,
    )
    return token


def _clear_session_cookie(response: Response) -> None:
    """Expire the session cookie in the browser."""
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path=SESSION_COOKIE_PATH,
        httponly=True,
        samesite="strict",
    )


async def _upsert_config(
    db: aiosqlite.Connection,
    key: str,
    value: str,
    category: str,
    description: str,
) -> None:
    """Insert or update a row in ``system_config`` (seed rows may be missing)."""
    await db.execute(
        """
        INSERT INTO system_config (key, value, category, description, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            category = excluded.category,
            description = excluded.description,
            updated_at = CURRENT_TIMESTAMP
        """,
        (key, value, category, description),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("/status")
async def check_setup_status() -> dict[str, bool]:
    """Report whether the single local administrator account already exists."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            row = await cursor.fetchone()

    user_count = int(row[0]) if row else 0
    return {
        "is_setup_completed": user_count > 0,
        "requires_onboarding": user_count == 0,
    }


@router.post("/setup", status_code=status.HTTP_201_CREATED)
async def initial_setup(payload: SetupRequest, response: Response) -> dict[str, str]:
    """
    Create the master administrator once, persist the initial toolchain config
    and immediately open an authenticated session.

    Returns 400 when setup already ran, so a second call can never overwrite the
    existing administrator.
    """
    username = payload.username.strip()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username must not be empty.",
        )

    rocm_path = payload.rocm_path.strip() or DEFAULT_ROCM_PATH

    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            row = await cursor.fetchone()
        if row and int(row[0]) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Setup is already completed. Please login instead.",
            )

        password_hash = hash_password(payload.password)

        try:
            await db.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, password_hash),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Setup is already completed. Please login instead.",
            ) from None

        await _upsert_config(
            db,
            "rocm_path",
            rocm_path,
            "hardware",
            "Path installation AMD ROCm on system",
        )
        await _upsert_config(
            db,
            "ai_voice_character",
            payload.voice_character,
            "voice_assistant",
            "Active sound character (koji_engineer / koji_guide)",
        )
        await _upsert_config(
            db,
            "setup_completed",
            "true",
            "security",
            "Status is the first onboarding finished",
        )
        await db.commit()

    _set_session_cookie(response, username)
    return {
        "message": "Setup successful. Mandala administrator account is active.",
        "username": username,
        "rocm_path": rocm_path,
        "voice_character": payload.voice_character,
    }


@router.post("/login")
async def login(payload: LoginRequest, response: Response) -> dict[str, str]:
    """Verify the administrator credentials and issue a 24h session cookie."""
    username = payload.username.strip()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (username,),
        ) as cursor:
            row = await cursor.fetchone()

        if row is None or not verify_password(payload.password, row["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password.",
            )

        await db.execute(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
            (row["id"],),
        )
        await db.commit()
        resolved_username = str(row["username"])

    _set_session_cookie(response, resolved_username)
    return {
        "message": "Login successful.",
        "username": resolved_username,
    }


@router.get("/me")
async def read_current_session(
    current_user: str = Depends(get_current_user),
) -> dict[str, str | bool]:
    """Guard probe: 401 when the cookie is absent/expired, otherwise the user."""
    return {"authenticated": True, "username": current_user}


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    """Invalidate the browser session cookie."""
    _clear_session_cookie(response)
    return {"message": "Logout successful."}
