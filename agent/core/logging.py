"""
Tether Agent — Structured JSON Logger

Every command executed by the agent is logged as a single-line JSON record
so that audit trails are machine-parseable from day one (Phase 2 will persist
these records to SQLite; for now they go to stdout/file).
"""
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from agent.core.config import LOG_LEVEL, LAPTOP_ID


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


def get_logger(name: str) -> logging.Logger:
    """Return a JSON-formatted logger for *name*."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(_JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(getattr(logging, LOG_LEVEL.upper(), logging.INFO))
        logger.propagate = False
    return logger
