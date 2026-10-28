from __future__ import annotations

import sqlite3
from pathlib import Path

from backend.security import DB_PATH

SCHEMA_PATH = Path(__file__).resolve().parent / "db" / "schema.sql"


def initialize_database(db_path: str | None = None) -> None:
    """Create the SQLite schema if it is missing. Safe to call on every boot."""
    target = Path(db_path or DB_PATH)
    target.parent.mkdir(parents=True, exist_ok=True)
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    with sqlite3.connect(target) as connection:
        connection.executescript(schema)
        connection.commit()
