"""
Tether Agent — Pairing Route

GET /pair
    Generates a one-time pairing token (valid for PAIRING_TOKEN_TTL seconds).
    Returns:
      - pairing_token : the raw token string (for manual entry)
      - qr_data_url   : base64 PNG data-URL of a QR code encoding the same token
      - expires_in    : seconds until the token expires
      - laptop_id     : so the mobile app can label the pairing

The token is stored in a small in-memory dict (_pending_tokens) keyed by the
token itself, with an expiry timestamp.  POST /auth/pair consumes and deletes
it (one-time use).  Expired tokens are cleaned up lazily on each GET /pair.

Encoding in the QR code
    tether://pair?token=<token>&laptop_id=<LAPTOP_ID>
    (The mobile app parses this URI scheme to pre-fill the pairing form.)
"""
import base64
import io
import secrets
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agent.core.config import LAPTOP_ID, PAIRING_TOKEN_TTL

try:
    import qrcode
    _HAS_QR = True
except ImportError:
    _HAS_QR = False


router = APIRouter(tags=["pairing"])

# in-memory store: token → expiry_timestamp
_pending_tokens: dict[str, float] = {}


# ── helpers ────────────────────────────────────────────────────────────────────

def _purge_expired() -> None:
    """Remove tokens that have already expired."""
    now = time.monotonic()
    expired = [t for t, exp in _pending_tokens.items() if exp < now]
    for t in expired:
        del _pending_tokens[t]


def _generate_pairing_token() -> str:
    """Create, store, and return a new one-time pairing token."""
    _purge_expired()
    token = secrets.token_urlsafe(32)
    _pending_tokens[token] = time.monotonic() + PAIRING_TOKEN_TTL
    return token


def consume_pairing_token(token: str) -> bool:
    """
    Validate and consume a pairing token (one-time use).

    Returns:
        True if the token was valid and has been consumed.
        False if unknown or expired.
    """
    _purge_expired()
    expiry = _pending_tokens.get(token)
    if expiry is None:
        return False
    if time.monotonic() > expiry:
        del _pending_tokens[token]
        return False
    del _pending_tokens[token]
    return True


# ── response model ─────────────────────────────────────────────────────────────

class PairCodeResponse(BaseModel):
    pairing_token: str
    qr_data_url: str | None
    expires_in: int
    laptop_id: str


# ── endpoint ───────────────────────────────────────────────────────────────────

@router.get(
    "/pair",
    response_model=PairCodeResponse,
    summary="Generate a one-time pairing code",
    description=(
        "Call this on the laptop to generate a pairing token. "
        "Scan the returned QR code with the Tether mobile app, "
        "or copy the `pairing_token` and POST it to `/auth/pair`."
    ),
)
async def get_pair_code() -> PairCodeResponse:
    token = _generate_pairing_token()
    uri = f"tether://pair?token={token}&laptop_id={LAPTOP_ID}"

    qr_data_url: str | None = None
    if _HAS_QR:
        try:
            img = qrcode.make(uri)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            b64 = base64.b64encode(buf.getvalue()).decode()
            qr_data_url = f"data:image/png;base64,{b64}"
        except Exception:
            qr_data_url = None   # non-fatal; token still usable manually

    return PairCodeResponse(
        pairing_token=token,
        qr_data_url=qr_data_url,
        expires_in=PAIRING_TOKEN_TTL,
        laptop_id=LAPTOP_ID,
    )
