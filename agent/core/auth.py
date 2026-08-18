"""
Tether Agent — JWT Auth Utilities

Token lifecycle:
  1. Phone calls POST /pair  → receives access_token (15 min) + refresh_token (30 days)
  2. Phone uses access_token on every command/status request
  3. Phone calls POST /auth/refresh with refresh_token to renew the access_token

Token structure (claims):
  sub   : device_id  (string, from paired_devices.id)
  type  : "access" | "refresh"
  exp   : UNIX timestamp (handled by python-jose)
  iat   : issued-at  (informational)

The FastAPI dependency `require_auth` is used on every protected endpoint.
It reads the Bearer token from the Authorization header, verifies it, checks
the device is still trusted in the DB, and returns the device_id string.
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt

from agent.core.config import (
    ACCESS_TOKEN_TTL,
    JWT_ALGORITHM,
    JWT_SECRET,
    REFRESH_TOKEN_TTL,
)

_bearer = HTTPBearer(auto_error=True)


# ── token creation ─────────────────────────────────────────────────────────────

def create_access_token(device_id: str) -> str:
    """Return a short-lived signed JWT for the given device."""
    return _make_token(device_id, "access", ACCESS_TOKEN_TTL)


def create_refresh_token(device_id: str) -> str:
    """Return a long-lived signed JWT for the given device (refresh only)."""
    return _make_token(device_id, "refresh", REFRESH_TOKEN_TTL)


def _make_token(device_id: str, token_type: str, ttl_seconds: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": device_id,
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ── token verification ─────────────────────────────────────────────────────────

def verify_token(token: str, expected_type: str = "access") -> str:
    """
    Decode and validate a JWT.

    Args:
        token: raw JWT string
        expected_type: "access" or "refresh"

    Returns:
        device_id (str)

    Raises:
        HTTPException 401 on any validation failure.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Expected {expected_type} token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    device_id: str | None = payload.get("sub")
    if not device_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )

    return device_id


# ── FastAPI dependency ─────────────────────────────────────────────────────────

def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> str:
    """
    FastAPI dependency: validate the Bearer access token and confirm the device
    is still trusted in the DB.

    Usage::

        @router.post("/commands/lock")
        async def cmd_lock(device_id: str = Depends(require_auth)):
            ...

    Returns:
        device_id string for use in audit logging.
    """
    # Import here to avoid circular imports (db imports config, config is fine)
    from agent.core import db

    device_id = verify_token(credentials.credentials, expected_type="access")

    if not db.is_device_trusted(device_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Device not trusted or has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return device_id
