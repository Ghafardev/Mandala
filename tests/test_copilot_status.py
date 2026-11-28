"""Tests for truthful Copilot runtime detection."""

from __future__ import annotations

import pytest

from backend.copilot_status import detect_copilot_runtime


def test_missing_agent_reports_the_rule_engine() -> None:
    status = detect_copilot_runtime(agent_configured=False)

    assert status["source"] == "pydantic_ai_rule_engine"
    assert status["reachable"] is False
    assert status["model_available"] is None
    assert "pydantic-ai" in status["detail"]


def test_unreachable_ollama_reports_the_rule_engine() -> None:
    def prober(endpoint: str):
        return False, [], f"connection refused: {endpoint}"

    status = detect_copilot_runtime(
        agent_configured=True,
        model="qwen3.5:b",
        endpoint="http://127.0.0.1:11434/v1",
        prober=prober,
    )

    assert status["source"] == "pydantic_ai_rule_engine"
    assert status["reachable"] is False
    assert status["model_available"] is None
    assert "connection refused" in status["detail"]


def test_reachable_ollama_without_the_model_is_not_reported_as_serving() -> None:
    def prober(endpoint: str):
        return True, ["llama3:8b"], None

    status = detect_copilot_runtime(
        agent_configured=True,
        model="qwen3.5:b",
        endpoint="http://127.0.0.1:11434/v1",
        prober=prober,
    )

    assert status["reachable"] is True
    assert status["model_available"] is False
    assert status["source"] == "pydantic_ai_rule_engine"
    assert "qwen3.5:b" in status["detail"]


def test_reachable_ollama_with_the_model_reports_the_local_model() -> None:
    def prober(endpoint: str):
        return True, ["qwen3.5:latest"], None

    status = detect_copilot_runtime(
        agent_configured=True,
        model="qwen3.5",
        endpoint="http://127.0.0.1:11434/v1",
        prober=prober,
    )

    assert status["model_available"] is True
    assert status["source"] == "pydantic_ai_ollama"


def test_model_and_endpoint_come_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MANDALA_COPILOT_MODEL", "llama3:8b")
    monkeypatch.setenv("MANDALA_OLLAMA_URL", "http://127.0.0.1:9999/v1/")

    seen: list[str] = []

    def prober(endpoint: str):
        seen.append(endpoint)
        return True, ["llama3:8b"], None

    status = detect_copilot_runtime(agent_configured=True, prober=prober)

    assert status["model"] == "llama3:8b"
    assert status["endpoint"] == "http://127.0.0.1:9999/v1"
    assert seen == ["http://127.0.0.1:9999/v1"]
