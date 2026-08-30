"""
Tether Agent — SQLite Persistence Layer

Tables
------
paired_devices
    id          TEXT PRIMARY KEY   — stable device identifier (UUID generated on pairing)
    name        TEXT               — human-readable name the phone supplies
    paired_at   TEXT               — ISO-8601 timestamp of first pairing
    last_seen   TEXT               — ISO-8601 timestamp of last successful command
    revoked     INTEGER            — 0 = active, 1 = revoked

command_audit_log
    id          INTEGER PRIMARY KEY AUTOINCREMENT
    ts          TEXT               — ISO-8601 timestamp
    device_id   TEXT               — FK → paired_devices.id
    action      TEXT               — e.g. "lock", "screenshot", "volume"
    source_ip   TEXT               — client IP at time of request
    ok          INTEGER            — 1 = success, 0 = failure
    error       TEXT               — error message if ok=0, NULL otherwise

All functions are synchronous (sqlite3 is blocking) and safe to call from
an async FastAPI handler via run_in_executor — or directly, since the SQLite
operations here are fast enough for this workload.
"""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Generator

from agent.core.config import DB_PATH


# ── connection helper ──────────────────────────────────────────────────────────

@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    """Yield an auto-closing, WAL-mode SQLite connection."""
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── schema initialisation ──────────────────────────────────────────────────────

def init_db() -> None:
    """Create tables if they don't exist. Called once at agent startup."""
    with _conn() as con:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS paired_devices (
                id        TEXT PRIMARY KEY,
                name      TEXT    NOT NULL,
                paired_at TEXT    NOT NULL,
                last_seen TEXT    NOT NULL,
                revoked   INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS command_audit_log (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                ts        TEXT    NOT NULL,
                device_id TEXT    NOT NULL,
                action    TEXT    NOT NULL,
                source_ip TEXT    NOT NULL,
                ok        INTEGER NOT NULL,
                error     TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_audit_device
                ON command_audit_log (device_id);
            CREATE INDEX IF NOT EXISTS idx_audit_ts
                ON command_audit_log (ts);

            CREATE TABLE IF NOT EXISTS agent_settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)


# ── agent_settings ─────────────────────────────────────────────────────────────
# Generic key/value store for settings the phone can change at runtime.
# Deliberately generic rather than a proximity-specific table: env vars can't
# be changed in a running process, and the next feature that needs a toggle
# shouldn't need another migration.

def get_setting(key: str, default: str | None = None) -> str | None:
    with _conn() as con:
        row = con.execute("SELECT value FROM agent_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    """Upsert a single setting."""
    with _conn() as con:
        con.execute(
            """
            INSERT INTO agent_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                           updated_at = excluded.updated_at
            """,
            (key, value, _now()),
        )


# ── paired_devices ─────────────────────────────────────────────────────────────

def register_device(device_id: str, name: str) -> None:
    """Insert or replace a device entry (upsert on re-pair)."""
    now = _now()
    with _conn() as con:
        con.execute(
            """
            INSERT INTO paired_devices (id, name, paired_at, last_seen, revoked)
            VALUES (?, ?, ?, ?, 0)
            ON CONFLICT(id) DO UPDATE SET
                name      = excluded.name,
                paired_at = excluded.paired_at,
                last_seen = excluded.last_seen,
                revoked   = 0
            """,
            (device_id, name, now, now),
        )


def revoke_device(device_id: str) -> bool:
    """
    Mark a device as revoked.

    Returns:
        True if the device existed and was revoked, False if not found.
    """
    with _conn() as con:
        cur = con.execute(
            "UPDATE paired_devices SET revoked = 1 WHERE id = ?",
            (device_id,),
        )
        return cur.rowcount > 0


def get_active_devices() -> list[dict]:
    """Return all non-revoked paired devices as a list of dicts."""
    with _conn() as con:
        rows = con.execute(
            "SELECT id, name, paired_at, last_seen FROM paired_devices WHERE revoked = 0"
        ).fetchall()
        return [dict(r) for r in rows]


def is_device_trusted(device_id: str) -> bool:
    """Return True iff the device exists and has not been revoked."""
    with _conn() as con:
        row = con.execute(
            "SELECT revoked FROM paired_devices WHERE id = ?",
            (device_id,),
        ).fetchone()
        return row is not None and row["revoked"] == 0


def touch_device(device_id: str) -> None:
    """Update last_seen for an active device (called on every successful command)."""
    with _conn() as con:
        con.execute(
            "UPDATE paired_devices SET last_seen = ? WHERE id = ? AND revoked = 0",
            (_now(), device_id),
        )


# ── command_audit_log ──────────────────────────────────────────────────────────

def log_command(
    *,
    device_id: str,
    action: str,
    source_ip: str,
    ok: bool,
    error: str | None = None,
) -> None:
    """Append one record to command_audit_log and update the device's last_seen."""
    with _conn() as con:
        con.execute(
            """
            INSERT INTO command_audit_log (ts, device_id, action, source_ip, ok, error)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (_now(), device_id, action, source_ip, int(ok), error),
        )
        # Keep last_seen fresh on successful commands
        if ok:
            con.execute(
                "UPDATE paired_devices SET last_seen = ? WHERE id = ?",
                (_now(), device_id),
            )


def get_audit_log(device_id: str | None = None, limit: int = 100) -> list[dict]:
    """
    Retrieve recent audit log entries, optionally filtered by device.

    Args:
        device_id: if provided, only return records for that device
        limit: maximum number of records to return (most-recent first)
    """
    with _conn() as con:
        if device_id:
            rows = con.execute(
                """
                SELECT id, ts, device_id, action, source_ip, ok, error
                FROM command_audit_log
                WHERE device_id = ?
                ORDER BY id DESC LIMIT ?
                """,
                (device_id, limit),
            ).fetchall()
        else:
            rows = con.execute(
                """
                SELECT id, ts, device_id, action, source_ip, ok, error
                FROM command_audit_log
                ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]
