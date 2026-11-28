from __future__ import annotations

import os
from pathlib import Path

import pytest

from backend import config

# Settings this module reads.
ENV_NAMES = (
    "MANDALA_COPILOT_MODEL",
    "MANDALA_OLLAMA_URL",
    "MANDALA_TELEMETRY_INTERVAL",
    "MANDALA_COOKIE_SECURE",
)

# Documented in .env.example but consumed by the Node UI proxy (server.ts), not by Python.
PROXY_ENV_NAMES = ("MANDALA_API_URL",)


def _clear_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ENV_NAMES + PROXY_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)


def test_defaults_when_nothing_is_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given: no Mandala variables in the environment.
    _clear_environment(monkeypatch)

    # Then: every setting falls back to its documented default.
    assert config.copilot_model() == "qwen3.5:b"
    assert config.ollama_url() == "http://localhost:11434/v1"
    assert config.telemetry_interval_seconds() == 1.0
    assert config.cookie_secure() is False


def test_environment_overrides_and_normalization(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given: operator-supplied values in the environment.
    monkeypatch.setenv("MANDALA_COPILOT_MODEL", " llama3:8b ")
    monkeypatch.setenv("MANDALA_OLLAMA_URL", "http://127.0.0.1:9999/v1/")
    monkeypatch.setenv("MANDALA_TELEMETRY_INTERVAL", "2.5")
    monkeypatch.setenv("MANDALA_COOKIE_SECURE", "TRUE")

    # Then: they are read verbatim apart from trimming and trailing-slash cleanup.
    assert config.copilot_model() == "llama3:8b"
    assert config.ollama_url() == "http://127.0.0.1:9999/v1"
    assert config.telemetry_interval_seconds() == 2.5
    assert config.cookie_secure() is True


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("0.5", 0.5), ("not-a-number", 1.0), ("0", 0.05), ("-3", 0.05)],
)
def test_telemetry_interval_never_returns_a_meaningless_value(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: float
) -> None:
    monkeypatch.setenv("MANDALA_TELEMETRY_INTERVAL", raw)

    assert config.telemetry_interval_seconds() == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1", True),
        ("true", True),
        ("yes", True),
        ("on", True),
        ("0", False),
        ("false", False),
        ("off", False),
        ("maybe", False),
    ],
)
def test_cookie_secure_only_trusts_explicit_truthy_values(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: bool
) -> None:
    monkeypatch.setenv("MANDALA_COOKIE_SECURE", raw)

    assert config.cookie_secure() is expected


def test_env_file_seeds_missing_values_without_overriding_the_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Given: a .env file plus a variable already set in the real environment.
    monkeypatch.setenv("MANDALA_COPILOT_MODEL", "qwen3.5:a")
    monkeypatch.delenv("MANDALA_TELEMETRY_INTERVAL", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# comment line\nMANDALA_COPILOT_MODEL=qwen3.5:b\nMANDALA_TELEMETRY_INTERVAL=\"0.25\"\n",
        encoding="utf-8",
    )

    # When: the file is loaded.
    try:
        loaded = config.load_env_file(env_file)

        # Then: the real environment wins, missing values are seeded, quotes dropped.
        assert loaded == env_file
        assert config.copilot_model() == "qwen3.5:a"
        assert config.telemetry_interval_seconds() == 0.25
    finally:
        os.environ.pop("MANDALA_TELEMETRY_INTERVAL", None)


def test_env_file_absence_is_not_an_error(tmp_path: Path) -> None:
    assert config.load_env_file(tmp_path / "missing.env") is None


def test_example_file_documents_every_setting() -> None:
    # Given: the checked-in example configuration.
    text = (config.PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")
    documented = {
        line.split("=", 1)[0].strip()
        for line in text.splitlines()
        if line.strip() and not line.strip().startswith("#")
    }

    # Then: it covers the settings this module reads plus the proxy-only origin,
    # and nothing that no code consumes.
    assert documented == set(ENV_NAMES) | set(PROXY_ENV_NAMES)
