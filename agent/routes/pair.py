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
from fastapi.responses import HTMLResponse
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
    return _build_pair_code()


def _build_pair_code() -> PairCodeResponse:
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


@router.get(
    "/pair/view",
    response_class=HTMLResponse,
    summary="Human-friendly pairing page (scan this QR from the phone)",
    description=(
        "Open this in a browser on the laptop to see the pairing QR code "
        "rendered as an image, plus the raw token for manual entry. "
        "Auto-refreshes with a new code once the current one expires."
    ),
)
async def get_pair_page() -> HTMLResponse:
    code = _build_pair_code()

    if code.qr_data_url:
        qr_html = f'<img src="{code.qr_data_url}" alt="Pairing QR code" width="280" height="280" />'
    else:
        qr_html = (
            '<p class="warn">QR image unavailable (the <code>qrcode</code> package '
            "isn't installed) — use the code below instead.</p>"
        )

    html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="{code.expires_in}" />
<title>Tether — Pair a device</title>
<style>
  body {{
    font-family: -apple-system, Segoe UI, Roboto, sans-serif;
    background: #f3f4f6; color: #111; margin: 0;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh;
  }}
  .card {{
    background: #fff; border-radius: 16px; padding: 32px 40px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; max-width: 360px;
  }}
  h1 {{ font-size: 20px; margin: 0 0 4px; }}
  .laptop-id {{ color: #666; font-size: 14px; margin-bottom: 20px; }}
  .token {{
    font-family: ui-monospace, monospace; font-size: 13px; word-break: break-all;
    background: #f3f4f6; border-radius: 8px; padding: 10px 12px; margin-top: 16px;
    user-select: all;
  }}
  .hint {{ color: #666; font-size: 13px; margin-top: 12px; }}
  .warn {{ color: #b45309; font-size: 13px; }}
  a.refresh {{ display: inline-block; margin-top: 16px; color: #2563eb; text-decoration: none; font-size: 14px; }}
</style>
</head>
<body>
  <div class="card">
    <h1>Pair with {LAPTOP_ID}</h1>
    <div class="laptop-id">Scan this with the Tether app's "Scan QR code" button</div>
    {qr_html}
    <div class="hint">Or tap "Enter code manually" and paste this:</div>
    <div class="token">{code.pairing_token}</div>
    <div class="hint">Valid for {code.expires_in // 60} minutes. This page refreshes itself with a new code once it expires.</div>
    <a class="refresh" href="/pair/view">Get a new code now</a>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)
