"""
Tether Agent — Command Routes

Five core command endpoints.
Each endpoint:
  1. Validates the caller's JWT (require_auth dependency → device_id)
  2. Calls the OS layer
  3. Persists the outcome to command_audit_log (SQLite)
  4. Returns a uniform JSON response body

Phase 1 had no auth; Phase 2 adds the require_auth dependency and SQLite audit.
Phase 4 will add the WebSocket push for real-time command feedback.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from agent.core import auth, db
from agent.core.logging import get_logger
from agent.os_layer import windows as win

router = APIRouter(prefix="/commands", tags=["commands"])
log = get_logger("tether.commands")


# ── response model ─────────────────────────────────────────────────────────────

class CommandResponse(BaseModel):
    ok: bool
    action: str
    result: dict | str | None = None
    error: str | None = None


def _respond(
    action: str,
    outcome: dict,
    request: Request,
    device_id: str,
) -> CommandResponse:
    """Convert an os_layer outcome dict into a CommandResponse, log it, and persist it."""
    source_ip = request.client.host if request.client else "unknown"

    # Structured stdout log (still useful for tailing)
    log.info(
        "command executed",
        extra={
            "action": action,
            "ok": outcome["ok"],
            "device_id": device_id,
            "source_ip": source_ip,
            "result": outcome.get("result"),
            "error": outcome.get("error"),
        },
    )

    # Persist to SQLite audit log
    db.log_command(
        device_id=device_id,
        action=action,
        source_ip=source_ip,
        ok=outcome["ok"],
        error=outcome.get("error"),
    )

    if not outcome["ok"]:
        raise HTTPException(status_code=500, detail=outcome["error"])

    return CommandResponse(ok=True, action=action, result=outcome.get("result"))


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.post("/lock", response_model=CommandResponse, summary="Lock the workstation")
async def cmd_lock(
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """
    Lock the Windows workstation immediately.
    Equivalent to pressing Win+L.
    """
    return _respond("lock", win.lock_workstation(), request, device_id)


@router.post("/sleep", response_model=CommandResponse, summary="Put the laptop to sleep")
async def cmd_sleep(
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """
    Suspend the laptop (S3 sleep state).
    The machine will wake on keyboard/mouse activity or power button press.
    """
    return _respond("sleep", win.sleep_system(), request, device_id)


class VolumeBody(BaseModel):
    level: int = Field(..., ge=0, le=100, description="Volume level 0–100")


@router.post("/volume", response_model=CommandResponse, summary="Set master volume")
async def cmd_volume(
    body: VolumeBody,
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """
    Set the Windows master audio volume (0–100).
    Uses Windows Core Audio (pycaw) for precise control without external tools.
    """
    return _respond("volume", win.set_volume(body.level), request, device_id)


class WifiBody(BaseModel):
    enable: bool | None = Field(
        default=None,
        description="true = enable, false = disable, null = toggle"
    )


@router.post("/wifi", response_model=CommandResponse, summary="Toggle Wi-Fi adapter")
async def cmd_wifi(
    body: WifiBody,
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """
    Enable, disable, or toggle the primary Wi-Fi adapter via netsh.
    Passing `enable: null` (or omitting the field) toggles the current state.
    """
    return _respond("wifi_toggle", win.toggle_wifi(body.enable), request, device_id)


@router.get("/screenshot", response_model=CommandResponse, summary="Take a screenshot")
async def cmd_screenshot(
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """
    Capture the full screen and return it as a base64-encoded JPEG.

    The `result.data_base64` field contains the raw JPEG bytes in base64.
    The mobile app decodes and displays this image inline.
    """
    return _respond("screenshot", win.take_screenshot(), request, device_id)


@router.post("/restart", response_model=CommandResponse, summary="Restart the laptop")
async def cmd_restart(
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """Restart the machine immediately. Destructive — the phone UI should confirm first."""
    return _respond("restart", win.restart_system(), request, device_id)


@router.post("/shutdown", response_model=CommandResponse, summary="Shut down the laptop")
async def cmd_shutdown(
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """Shut the machine down immediately. Destructive — the phone UI should confirm first."""
    return _respond("shutdown", win.shutdown_system(), request, device_id)


class MediaBody(BaseModel):
    action: str = Field(..., description="One of: play_pause, next, previous, stop")


@router.post("/media", response_model=CommandResponse, summary="Send a media control key")
async def cmd_media(
    body: MediaBody,
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """
    Simulate a media key press. Whatever app currently owns the system media
    session (Spotify, browser, etc.) receives it, same as a hardware key.
    """
    return _respond("media_control", win.media_control(body.action), request, device_id)


class BrightnessBody(BaseModel):
    level: int = Field(..., ge=0, le=100, description="Brightness level 0–100")


@router.post("/brightness", response_model=CommandResponse, summary="Set display brightness")
async def cmd_set_brightness(
    body: BrightnessBody,
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """Set the internal display's brightness (0-100). Laptop panels only."""
    return _respond("brightness", win.set_brightness(body.level), request, device_id)


@router.get("/brightness", response_model=CommandResponse, summary="Get display brightness")
async def cmd_get_brightness(
    request: Request,
    device_id: str = Depends(auth.require_auth),
):
    """Read the internal display's current brightness (0-100). Laptop panels only."""
    return _respond("brightness_get", win.get_brightness(), request, device_id)
