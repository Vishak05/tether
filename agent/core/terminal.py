"""
Tether Agent — Remote Terminal Access Control

A terminal is a different class of power from everything else the agent
exposes: lock/volume/screenshot are fixed actions, a shell is arbitrary code
execution as the logged-in user. So access is gated twice on top of the
normal pairing token:

  1. The feature is off until switched on.
  2. Each paired device must be individually allowed.

Both are stored in agent_settings and are changed ONLY from the laptop, via
agent/scripts/terminal_access.py. There is deliberately no API to change
them — otherwise a stolen phone could grant itself a shell.
"""
import json
from dataclasses import dataclass

from agent.core import db

_KEY_ENABLED = "terminal.enabled"
_KEY_ALLOWED = "terminal.allowed_devices"


@dataclass(frozen=True)
class TerminalAccess:
    enabled: bool
    allowed_devices: frozenset[str]


def get_access() -> TerminalAccess:
    """Current settings, re-read on every check so changes apply immediately."""
    enabled = db.get_setting(_KEY_ENABLED) == "true"
    try:
        allowed = json.loads(db.get_setting(_KEY_ALLOWED, "[]"))
        if not isinstance(allowed, list):
            allowed = []
    except (TypeError, ValueError):
        allowed = []
    return TerminalAccess(enabled=enabled, allowed_devices=frozenset(str(d) for d in allowed))


def set_enabled(enabled: bool) -> None:
    db.set_setting(_KEY_ENABLED, "true" if enabled else "false")


def _save_allowed(devices: set[str]) -> None:
    db.set_setting(_KEY_ALLOWED, json.dumps(sorted(devices)))


def allow_device(device_id: str) -> None:
    _save_allowed(set(get_access().allowed_devices) | {device_id})


def deny_device(device_id: str) -> None:
    _save_allowed(set(get_access().allowed_devices) - {device_id})


def denial_reason(device_id: str) -> str | None:
    """
    Why this device may not use the terminal right now, or None if it may.

    "untrusted" (revoked or unknown) is checked first so a revoked phone is
    told the same thing every other endpoint tells it.
    """
    if not db.is_device_trusted(device_id):
        return "untrusted"
    access = get_access()
    if not access.enabled:
        return "disabled"
    if device_id not in access.allowed_devices:
        return "not_allowed"
    return None
