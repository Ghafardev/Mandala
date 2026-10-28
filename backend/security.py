"""
Mandala Security Helpers
========================
Local-first authentication primitives for the Mandala ROCm Studio.

This module owns exactly three responsibilities:

1. Password hashing / verification (bcrypt through ``passlib``).
2. JWT session-token creation / decoding (PyJWT, HS256, 24h expiry).
3. The FastAPI dependency that authenticates the ``mandala_session``
   HTTP-Only cookie and resolves the current administrator.

The database lives at ``backend/db/mandala.db`` (schema: ``backend/db/schema.sql``).
The path is resolved from this file's location so the API behaves identically
whether uvicorn is started from the repository root or from ``backend/``.
"""

from __future__ import annotations

import os
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import bcrypt
import jwt
from fastapi import HTTPException, Request, status
from passlib.context import CryptContext

# bcrypt only consumes the first 72 bytes of a password.
BCRYPT_MAX_BYTES = 72


def _patch_passlib_bcrypt_compat() -> None:
    """
    Keep passlib 1.7.4 working on bcrypt >= 4.1 and >= 5.0.

    passlib 1.7.4 was released before bcrypt 5.0 and relies on two removed
    behaviours: ``bcrypt.__about__.__version__`` and silent truncation of
    passwords longer than 72 bytes. Its backend self-test hashes a 260-byte
    secret, so bcrypt 5.0 raises ``ValueError`` and the whole backend fails to
    load. Wrapping ``hashpw``/``checkpw`` with the truncation bcrypt used to
    perform restores that contract without weakening the hash itself.
    """
    if not hasattr(bcrypt, "__about__"):
        bcrypt.__about__ = types.SimpleNamespace(  # type: ignore[attr-defined]
            __version__=getattr(bcrypt, "__version__", "unknown")
        )

    original_hashpw = bcrypt.hashpw
    original_checkpw = bcrypt.checkpw

    def hashpw(password: bytes, salt: bytes) -> bytes:
        return original_hashpw(password[:BCRYPT_MAX_BYTES], salt)

    def checkpw(password: bytes, hashed_password: bytes) -> bool:
        return original_checkpw(password[:BCRYPT_MAX_BYTES], hashed_password)

    bcrypt.hashpw = hashpw  # type: ignore[assignment]
    bcrypt.checkpw = checkpw  # type: ignore[assignment]


_patch_passlib_bcrypt_compat()

# ---------------------------------------------------------------------------
# Paths & configuration
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

# Canonical local database file -> backend/db/mandala.db
# Override with MANDALA_DB_PATH for tests, smoke runs, or an alternate install.
DB_PATH = os.getenv("MANDALA_DB_PATH", str(BACKEND_DIR / "db" / "mandala.db"))

# The signing secret must be stable across restarts, otherwise every existing
# session cookie becomes invalid. Override it in production via the environment.
SECRET_KEY = os.getenv(
    "MANDALA_SECRET_KEY",
    "mandala-local-fallback-secret-key-32bytes-change-me",
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

SESSION_COOKIE_NAME = "mandala_session"
SESSION_COOKIE_MAX_AGE = ACCESS_TOKEN_EXPIRE_HOURS * 60 * 60  # 86_400 seconds

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
def _bcrypt_safe(password: str) -> str:
    """Return a UTF-8 representation of *password* that fits bcrypt's limit."""
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES].decode("utf-8", errors="ignore")


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt and return the encoded digest."""
    if not password:
        raise ValueError("Password must not be empty.")
    return pwd_context.hash(_bcrypt_safe(password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time bcrypt verification that never leaks or raises."""
    if not plain_password or not hashed_password:
        return False
    try:
        return pwd_context.verify(_bcrypt_safe(plain_password), hashed_password)
    except (TypeError, ValueError):
        return False


# ---------------------------------------------------------------------------
# JWT session tokens
# ---------------------------------------------------------------------------
def create_access_token(
    data: dict[str, Any],
    expires_hours: int = ACCESS_TOKEN_EXPIRE_HOURS,
) -> str:
    """Sign *data* into an HS256 JWT that expires in ``expires_hours`` hours."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        **data,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(hours=expires_hours),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify a session JWT. Raises ``jwt.PyJWTError`` on failure."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------
async def get_current_user(request: Request) -> str:
    """
    Read the HTTP-Only ``mandala_session`` cookie, verify the JWT and return
    the administrator username. Raises HTTP 401 when the session is missing,
    expired or tampered with.
    """
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found. Please login first.",
        )

    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please login again.",
        ) from None
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
        ) from None

    username = payload.get("sub")
    if not isinstance(username, str) or not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
        )
    return username


async def get_optional_user(request: Request) -> str | None:
    """Same as :func:`get_current_user` but returns ``None`` instead of raising."""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
