"""
Tether Agent — Status Route

GET /status  →  returns a live snapshot of the laptop's current state:
  - battery level + charging state + time remaining
  - foreground window title and process
  - lock state (heuristic)
  - agent uptime + version

Protected by JWT auth from Phase 2 onwards.
Used as the health-check for the mobile app's connection indicator (Phase 3)
and the WebSocket pre-check (Phase 5).
"""
import time
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from agent.core import auth
from agent.core.config import LAPTOP_ID, PLATFORM
from agent.core.logging import get_logger
from agent.os_layer import windows as win

router = APIRouter(tags=["status"])
log = get_logger("tether.status")

# record when the agent started so we can report uptime
_AGENT_START: float = time.time()
AGENT_VERSION: str = "0.3.0-phase3"


class StatusResponse(BaseModel):
    ok: bool
    laptop_id: str
    platform: str
    version: str
    uptime_secs: float
    state: dict | None = None


@router.get("/status", response_model=StatusResponse, summary="Laptop status snapshot")
async def get_status(
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """
    Returns a live snapshot of the laptop's current state.

    Safe to call at any time — it never mutates system state.
    Used by the mobile app on startup and periodically while connected.
    """
    outcome = win.get_status()
    uptime = round(time.time() - _AGENT_START, 1)

    log.info(
        "status polled",
        extra={
            "device_id": device_id,
            "source_ip": request.client.host if request.client else "unknown",
            "uptime_secs": uptime,
        },
    )

    return StatusResponse(
        ok=outcome["ok"],
        laptop_id=LAPTOP_ID,
        platform=PLATFORM,
        version=AGENT_VERSION,
        uptime_secs=uptime,
        state=outcome.get("result"),
    )
