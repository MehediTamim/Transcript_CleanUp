from __future__ import annotations

import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def init_session_schema(db_path: str) -> None:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                initial_transcript TEXT NOT NULL,
                finalized_content TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
            CREATE INDEX IF NOT EXISTS idx_messages_session_created
                ON messages(session_id, created_at);
            """
        )
        conn.commit()
    finally:
        conn.close()


class SessionStore:
    def __init__(self, db_path: str):
        self._path = db_path

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self._path, check_same_thread=False)

    def create_session(self, initial_transcript: str) -> str:
        sid = str(uuid.uuid4())
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO sessions (id, initial_transcript, status, created_at) VALUES (?, ?, ?, ?)",
                (sid, initial_transcript, "active", _now_iso()),
            )
            conn.commit()
        finally:
            conn.close()
        return sid

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        conn = self._conn()
        try:
            cur = conn.execute(
                "SELECT id, initial_transcript, finalized_content, status, created_at FROM sessions WHERE id = ?",
                (session_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": row[0],
                "initial_transcript": row[1],
                "finalized_content": row[2],
                "status": row[3],
                "created_at": row[4],
            }
        finally:
            conn.close()

    def list_messages(self, session_id: str) -> list[dict[str, Any]]:
        conn = self._conn()
        try:
            cur = conn.execute(
                "SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            )
            return [
                {"id": r[0], "role": r[1], "content": r[2], "created_at": r[3]}
                for r in cur.fetchall()
            ]
        finally:
            conn.close()

    def add_message(self, session_id: str, role: str, content: str) -> str:
        mid = str(uuid.uuid4())
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                (mid, session_id, role, content, _now_iso()),
            )
            conn.commit()
        finally:
            conn.close()
        return mid

    def get_last_assistant_content(self, session_id: str) -> str | None:
        conn = self._conn()
        try:
            cur = conn.execute(
                """
                SELECT content FROM messages
                WHERE session_id = ? AND role = 'assistant'
                ORDER BY created_at DESC LIMIT 1
                """,
                (session_id,),
            )
            row = cur.fetchone()
            return row[0] if row else None
        finally:
            conn.close()

    def finalize(self, session_id: str, content: str) -> None:
        conn = self._conn()
        try:
            conn.execute(
                "UPDATE sessions SET finalized_content = ?, status = ? WHERE id = ?",
                (content, "finalized", session_id),
            )
            conn.commit()
        finally:
            conn.close()
