"""
Tether Agent — Proximity Auto-Lock Routes

Lets the phone app configure and observe the agent-side auto-lock: pick which
bonded device counts as "you", turn it on, and see whether the laptop can
currently see it.

The detection itself runs entirely on the laptop (agent/core/proximity.py), so
these endpoints are configuration only — nothing here needs the app to be
running for auto-lock to work. That's the point of the feature.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from agent.core import auth, db, proximity
from agent.core.logging import get_logger
from agent.os_layer import bluetooth

log = get_logger("tether.proximity_routes")

router = APIRouter(prefix="/proximity", tags=["proximity"])


class ProximityState(BaseModel):
    enabled: bool
    target_mac: str | None
    target_name: str | None
    poll_interval_secs: int
    miss_threshold: int
    present: bool | None = Field(None, description="null until the first probe completes")
    armed: bool
    consecutive_misses: int
    last_probe_at: str | None
    last_detail: str | None
    last_lock_at: str | None
    last_error: str | None
    running: bool


class UpdateProximityBody(BaseModel):
    enabled: bool | None = None
    target_mac: str | None = None
    target_name: str | None = None
    poll_interval_secs: int | None = Field(None, ge=10, le=300)
    miss_threshold: int | None = Field(None, ge=1, le=20)


class BondedDevice(BaseModel):
    mac: str
    name: str


class BondedListResponse(BaseModel):
    devices: list[BondedDevice]


@router.get("", response_model=ProximityState, summary="Get auto-lock settings and live state")
async def get_proximity(device_id: str = Depends(auth.require_auth)) -> ProximityState:
    """Current configuration plus whether the phone is being seen right now."""
    return ProximityState(**proximity.SERVICE.snapshot())


@router.patch("", response_model=ProximityState, summary="Update auto-lock settings")
async def update_proximity(
    body: UpdateProximityBody,
    request: Request,
    device_id: str = Depends(auth.require_auth),
) -> ProximityState:
    """
    Partial update — only the fields present in the body are written.

    Takes effect on the next poll without restarting the agent, which matters
    because it runs as a scheduled task the user can't restart from the app.
    """
    mac = body.target_mac
    if mac is not None:
        normalized = bluetooth.normalize_mac(mac)
        if normalized is None:
            raise HTTPException(status_code=400, detail=f"'{mac}' is not a valid Bluetooth address")
        mac = normalized

    settings = proximity.get_settings()
    # Guard against arming a lock with nothing to look for — it would see no
    # device, count misses, and lock the machine every time it re-armed.
    if body.enabled and not (mac or settings.target_mac):
        raise HTTPException(status_code=400, detail="Pick a target device before enabling auto-lock")

    updated = proximity.save_settings(
        enabled=body.enabled,
        target_mac=mac,
        target_name=body.target_name,
        poll_interval_secs=body.poll_interval_secs,
        miss_threshold=body.miss_threshold,
    )
    proximity.SERVICE.on_settings_changed()

    db.log_command(
        device_id=device_id,
        action="proximity_config",
        source_ip=request.client.host if request.client else "unknown",
        ok=True,
    )
    log.info(
        "proximity settings updated",
        extra={"device_id": device_id, "enabled": updated.enabled, "target_mac": updated.target_mac},
    )
    return ProximityState(**proximity.SERVICE.snapshot())


@router.get("/bonded", response_model=BondedListResponse, summary="List bonded Bluetooth devices")
async def list_bonded(device_id: str = Depends(auth.require_auth)) -> BondedListResponse:
    """
    Devices already paired with the laptop, for the target picker.

    Only bonded devices are offered: the probe relies on a stable classic
    Bluetooth address, which pairing establishes. It deliberately doesn't scan
    for nearby unpaired devices.
    """
    outcome = bluetooth.list_bonded_devices()
    if not outcome["ok"]:
        raise HTTPException(status_code=503, detail=outcome["error"])
    return BondedListResponse(devices=[BondedDevice(**d) for d in outcome["result"]])
