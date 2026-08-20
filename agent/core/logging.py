"""
Tether Agent — Structured JSON Logger

Every command executed by the agent is logged as a single-line JSON record
so that audit trails are machine-parseable from day one (Phase 2 will persist
these records to SQLite; for now they go to stdout/file).

Always writes to a rotating log file at ~/.tether/agent.log — this is what
makes logs inspectable when running headless (see below), and keeps the file
from growing unbounded over weeks of uptime. Also writes to stdout, but only
when stdout is actually usable: launched via pythonw.exe (used by the Task
Scheduler entry so the agent doesn't pop a console window — see
agent/scripts/install_task.ps1), sys.stdout is None, and unconditionally
wrapping it in a StreamHandler would crash the very first log call.
"""
import json
import logging
import logging.handlers
import sys
from datetime import datetime, timezone
from typing import Any

from agent.core.config import LAPTOP_ID, LOG_DIR, LOG_LEVEL


class _JsonFormatter(logging.Formatter):
    """Converts a LogRecord into a compact JSON line."""

    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "laptop_id": LAPTOP_ID,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # Attach any extra fields passed via `extra=`
        for key, val in record.__dict__.items():
            if key not in (
                "args", "created", "exc_info", "exc_text", "filename",
                "funcName", "levelname", "levelno", "lineno", "message",
                "module", "msecs", "msg", "name", "pathname", "process",
                "processName", "relativeCreated", "stack_info", "thread",
                "threadName",
            ):
                payload[key] = val
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _stdout_is_usable() -> bool:
    """False under pythonw.exe (no console) — sys.stdout is None there."""
    return sys.stdout is not None and hasattr(sys.stdout, "write")


def get_logger(name: str) -> logging.Logger:
    """Return a JSON-formatted logger for *name*."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        formatter = _JsonFormatter()

        file_handler = logging.handlers.RotatingFileHandler(
            LOG_DIR / "agent.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

        if _stdout_is_usable():
            stream_handler = logging.StreamHandler(sys.stdout)
            stream_handler.setFormatter(formatter)
            logger.addHandler(stream_handler)

        logger.setLevel(getattr(logging, LOG_LEVEL.upper(), logging.INFO))
        logger.propagate = False
    return logger
