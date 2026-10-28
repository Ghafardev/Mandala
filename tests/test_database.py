from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

import backend.database as database


def test_initialize_database_creates_schema_idempotently(tmp_path: Path) -> None:
    db_path = tmp_path / "nested" / "mandala.db"

    database.initialize_database(str(db_path))
    database.initialize_database(str(db_path))

    with sqlite3.connect(db_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        user_count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    assert {"users", "system_config", "task_history"} <= tables
    assert user_count == 0


def test_initialize_database_raises_when_schema_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(database, "SCHEMA_PATH", tmp_path / "missing.sql")

    with pytest.raises(FileNotFoundError):
        database.initialize_database(str(tmp_path / "mandala.db"))
