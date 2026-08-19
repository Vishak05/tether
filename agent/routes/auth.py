"""
Tether Agent — Auth Routes

POST /auth/pair
    Exchange a one-time pairing token for access + refresh JWTs.
    The phone calls this once after scanning the QR code.

POST /auth/refresh
    Exchange a valid refresh token for a fresh short-lived access token.
    The phone calls this on every app launch (or when an access token expires).

POST /auth/revoke
    Revoke the calling device's own tokens (logout).
    Requires a valid access token; a revoked device cannot refresh.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from agent.core import auth, db
from agent.core.logging import get_logger
from agent.routes.pair import consume_pairing_token

router = APIRouter(prefix="/auth", tags=["auth"])
log = get_logger("tether.auth")


# ── request / response models ──────────────────────────────────────────────────

class PairRequest(BaseModel):
    pairing_token: str = Field(..., description="One-time token from GET /pair")
    device_name: str  = Field(..., min_length=1, max_length=64,
                               description="Human-readable name for this phone")


class PairResponse(BaseModel):
    device_id:     str
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.post(
    "/pair",
    response_model=PairResponse,
    summary="Pair a new device",
    status_code=status.HTTP_201_CREATED,
)
async def pair_device(body: PairRequest) -> PairResponse:
    """
    Exchange the one-time pairing token for long-lived credentials.

    1. Validates the pairing token (must not be expired or already used).
    2. Assigns the device a stable UUID.
    3. Registers the device in `paired_devices`.
    4. Issues an access token (15 min) and a refresh token (30 days).
    """
    if not consume_pairing_token(body.pairing_token):
        log.warning("pair attempt with invalid/expired token")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired pairing token",
        )

    device_id = str(uuid.uuid4())
    db.register_device(device_id, body.device_name)

    access  = auth.create_access_token(device_id)
    refresh = auth.create_refresh_token(device_id)

    log.info("device paired", extra={"device_id": device_id, "device_name": body.device_name})
    return PairResponse(
        device_id=device_id,
        access_token=access,
        refresh_token=refresh,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh an access token",
)
async def refresh_token(body: RefreshRequest) -> TokenResponse:
    """
    Validate a refresh token and issue a new short-lived access token.

    The refresh token itself is not rotated here (stateless); rotation
    can be added in a future phase by storing token IDs in the DB.
    """
    device_id = auth.verify_token(body.refresh_token, expected_type="refresh")

    if not db.is_device_trusted(device_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Device has been revoked",
        )

    new_access = auth.create_access_token(device_id)
    log.info("access token refreshed", extra={"device_id": device_id})
    return TokenResponse(access_token=new_access)


@router.post(
    "/revoke",
    summary="Revoke this device (logout)",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_self(device_id: str = Depends(auth.require_auth)) -> None:
    """
    Revoke the currently authenticated device.
    All subsequent requests with this device's tokens will be rejected.
    """
    db.revoke_device(device_id)
    log.info("device self-revoked", extra={"device_id": device_id})
