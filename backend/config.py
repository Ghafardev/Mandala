"""Single source of truth for Mandala's environment configuration.

These settings used to be read with ad-hoc ``os.getenv`` calls scattered across the
backend, each with its own default and parsing rules, so the documented surface and
the code could drift apart. They now live here, mirroring ``.env.example``.

Values are read from the process environment on access, which lets tests change
them with ``monkeypatch.setenv`` and lets a running server see the same rules.
"""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE_NAME = ".env"

DEFAULT_COPILOT_MODEL = "qwen3.5:b"
DEFAULT_OLLAMA_URL = "http://localhost:11434/v1"
DEFAULT_TELEMETRY_INTERVAL_SECONDS = 1.0
MIN_TELEMETRY_INTERVAL_SECONDS = 0.05
DEFAULT_COOKIE_SECURE = False

_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
_FALSE_VALUES = frozenset({"0", "false", "no", "off"})


def _raw(name: str, default: str) -> str:
    """Read a variable, treating an empty value as unset."""
    return os.getenv(name, "").strip() or default


def load_env_file(path: Path | str | None = None) -> Path | None:
    """Seed unset variables from ``.env``; real environment variables win.

    Stdlib-only on purpose: the backend reads the file documented in
    ``.env.example`` without pulling in another dependency.
    """
    env_path = Path(path or os.getenv("MANDALA_ENV_FILE") or PROJECT_ROOT / ENV_FILE_NAME)
    if not env_path.is_file():
        return None

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value.strip().strip("\"'")

    return env_path


def copilot_model() -> str:
    """Ollama model tag that serves Copilot replies."""
    return _raw("MANDALA_COPILOT_MODEL", DEFAULT_COPILOT_MODEL)


def ollama_url() -> str:
    """Base URL of the local Ollama OpenAI-compatible endpoint, without a trailing slash."""
    return _raw("MANDALA_OLLAMA_URL", DEFAULT_OLLAMA_URL).rstrip("/")


def telemetry_interval_seconds() -> float:
    """Seconds between shared telemetry samples."""
    raw = _raw("MANDALA_TELEMETRY_INTERVAL", str(DEFAULT_TELEMETRY_INTERVAL_SECONDS))
    try:
        interval = float(raw)
    except ValueError:
        return DEFAULT_TELEMETRY_INTERVAL_SECONDS
    return max(MIN_TELEMETRY_INTERVAL_SECONDS, interval)


def cookie_secure() -> bool:
    """Whether the session cookie carries the ``Secure`` flag (HTTPS deployments)."""
    raw = _raw("MANDALA_COOKIE_SECURE", "1" if DEFAULT_COOKIE_SECURE else "0").lower()
    if raw in _TRUE_VALUES:
        return True
    if raw in _FALSE_VALUES:
        return False
    return DEFAULT_COOKIE_SECURE


load_env_file()
