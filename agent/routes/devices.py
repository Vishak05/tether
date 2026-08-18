"""
Tether Agent — Device Management Routes

GET    /devices              — list all paired (non-revoked) devices
DELETE /devices/{device_id} — revoke a specific device by ID

Both endpoints require a valid access token (require_auth dependency).
A device can revoke any other device — this is intentional so that
from the phone app you can de-authorize a lost device.
(In a multi-admin scenario you'd scope this further; fine for MVP.)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from agent.core import auth, db
from agent.core.logging import get_logger

router = APIRouter(prefix="/devices", tags=["devices"])
log = get_logger("tether.devices")


# ── response models ────────────────────────────────────────────────────────────

class DeviceInfo(BaseModel):
    id:        str
    name:      str
    paired_at: str
    last_seen: str


class DeviceListResponse(BaseModel):
    devices: list[DeviceInfo]


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=DeviceListResponse,
    summary="List paired devices",
)
async def list_devices(
    caller_id: str = Depends(auth.require_auth),
) -> DeviceListResponse:
    """Return all currently paired and non-revoked devices."""
    rows = db.get_active_devices()
    devices = [DeviceInfo(**r) for r in rows]
    log.info("devices listed", extra={"caller": caller_id, "count": len(devices)})
    return DeviceListResponse(devices=devices)


@router.delete(
    "/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a paired device",
)
async def revoke_device(
    device_id: str,
    caller_id: str = Depends(auth.require_auth),
) -> None:
    """
    Revoke access for the given device_id.

    The revoked device's existing tokens will be rejected on the next
    request (is_device_trusted check in require_auth).
    """
    revoked = db.revoke_device(device_id)
    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device {device_id!r} not found or already revoked",
        )
    log.info(
        "device revoked",
        extra={"target_device": device_id, "revoked_by": caller_id},
    )
