"""Truthful Copilot runtime detection.

The chat route silently falls back to a deterministic rule engine when no local
model answers. The UI used to claim "Qwen 3.5 (Local)" regardless, so this module
reports what would actually serve a reply: configured model, reachability, whether
that model is present, and the resulting ``source``.
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Tuple

DEFAULT_MODEL = "qwen3.5:b"
DEFAULT_ENDPOINT = "http://localhost:11434/v1"

Prober = Callable[[str], Tuple[bool, List[str], Optional[str]]]


def configured_model() -> str:
    return os.getenv("MANDALA_COPILOT_MODEL", DEFAULT_MODEL)


def configured_endpoint() -> str:
    return os.getenv("MANDALA_OLLAMA_URL", DEFAULT_ENDPOINT).rstrip("/")


def probe_models(endpoint: str, timeout: float = 1.5) -> Tuple[bool, List[str], Optional[str]]:
    """Read ``GET {endpoint}/models`` from Ollama with a short timeout."""
    try:
        with urllib.request.urlopen(f"{endpoint}/models", timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as error:
        return False, [], f"Ollama is not reachable at {endpoint}: {error}"

    entries = payload.get("data") if isinstance(payload, dict) else None
    ids = [
        entry["id"]
        for entry in entries or []
        if isinstance(entry, dict) and isinstance(entry.get("id"), str)
    ]
    return True, ids, None


def _is_same_model(requested: str, reported: str) -> bool:
    """Ollama appends ``:latest`` when a model is pulled without a tag."""
    if requested == reported:
        return True
    if ":" not in requested and reported == f"{requested}:latest":
        return True
    if ":" not in reported and requested == f"{reported}:latest":
        return True
    return False


def detect_copilot_runtime(
    *,
    agent_configured: bool,
    model: Optional[str] = None,
    endpoint: Optional[str] = None,
    prober: Optional[Prober] = None,
) -> Dict[str, Any]:
    """Return the runtime that would actually answer a Copilot request."""
    model = model or configured_model()
    endpoint = endpoint or configured_endpoint()

    result: Dict[str, Any] = {
        "agent_configured": agent_configured,
        "model": model,
        "endpoint": endpoint,
        "reachable": False,
        "model_available": None,
        "source": "pydantic_ai_rule_engine",
        "detail": "",
    }

    if not agent_configured:
        result["detail"] = (
            "pydantic-ai is not installed in this environment; replies come from "
            "the deterministic rule engine."
        )
        return result

    reachable, model_ids, error = (prober or probe_models)(endpoint)
    result["reachable"] = reachable
    if not reachable:
        result["detail"] = (error or "Ollama is not reachable.") + " Replies come from the rule engine."
        return result

    available = any(_is_same_model(model, candidate) for candidate in model_ids)
    result["model_available"] = available
    if not available:
        result["detail"] = (
            f"Ollama is reachable but '{model}' is not pulled "
            f"(available: {', '.join(model_ids) or 'none'}). Replies come from the rule engine."
        )
        return result

    result["source"] = "pydantic_ai_ollama"
    result["detail"] = f"'{model}' is served by Ollama at {endpoint}."
    return result
