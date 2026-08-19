"""
Tether Agent — WebSocket Status Route

WS /ws/status?token=<access_token>
    Pushes a heartbeat (battery, active window, lock state) every
    HEARTBEAT_INTERVAL_SECS. Replaces the Phase 3-era polling of GET /status
    for clients that want a live dashboard.

Auth handshake
    require_auth (agent/core/auth.py) can't be reused directly — it's an
    HTTPBearer dependency tied to the Authorization header, and WebSocket
    clients generally can't set custom headers on the handshake request.
    Instead, the access token is passed as a query param and verified with
    the same underlying auth.verify_token() + db.is_device_trusted() calls
    require_auth itself uses.

IP filtering
    Starlette's BaseHTTPMiddleware (agent/core/ip_filter.py's
    TailscaleIPMiddleware) only wraps HTTP-scope requests — it does not run
    for WebSocket connections. This route re-checks the source IP inline via
    ip_filter.is_source_allowed() so the Phase 3 network boundary still holds
    here too.

Multiple devices
    Each connection runs its own independent send loop; there's no shared
    broadcast state, since every loop iteration just polls the OS layer
    itself. A paired device revoked mid-session gets its socket closed within
    TRUST_RECHECK_EVERY_N_TICKS heartbeats, not just at the initial handshake.
"""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from agent.core import auth, db
from agent.core.config import HEARTBEAT_INTERVAL_SECS, TRUST_RECHECK_EVERY_N_TICKS
from agent.core.ip_filter import is_source_allowed
from agent.core.logging import get_logger
from agent.os_layer import windows as win

router = APIRouter(tags=["status"])
log = get_logger("tether.ws_status")


@router.websocket("/ws/status")
async def ws_status(websocket: WebSocket) -> None:
    source_ip = websocket.client.host if websocket.client else None

    if not is_source_allowed(source_ip):
        log.warning("ws rejected: source IP not on Tailscale network", extra={"source_ip": source_ip})
        await websocket.accept()
        await websocket.close(code=4403, reason="forbidden: source IP not on Tailscale network")
        return

    token = websocket.query_params.get("token")
    device_id: str | None = None
    if token:
        try:
            device_id = auth.verify_token(token, expected_type="access")
        except Exception:
            device_id = None

    if not device_id or not db.is_device_trusted(device_id):
        log.warning("ws rejected: invalid token or untrusted device", extra={"source_ip": source_ip})
        await websocket.accept()
        await websocket.close(code=4401, reason="unauthorized")
        return

    await websocket.accept()
    db.log_command(device_id=device_id, action="ws_connect", source_ip=source_ip or "unknown", ok=True)
    log.info("ws connected", extra={"device_id": device_id, "source_ip": source_ip})

    # Run the heartbeat send-loop and disconnect detection concurrently — the
    # loop only ever sends, so without a concurrent receive() it wouldn't
    # notice the client closing until the next scheduled send (up to
    # HEARTBEAT_INTERVAL_SECS later). watch_disconnect() consumes the ASGI
    # "websocket.disconnect" message as soon as the transport delivers it.
    async def heartbeat_loop() -> None:
        tick = 0
        while True:
            outcome = win.get_status()
            await websocket.send_json({
                "type": "heartbeat",
                "ts": datetime.now(timezone.utc).isoformat(),
                **(outcome.get("result") or {}),
            })

            tick += 1
            if tick % TRUST_RECHECK_EVERY_N_TICKS == 0 and not db.is_device_trusted(device_id):
                await websocket.close(code=4401, reason="device revoked")
                return

            await asyncio.sleep(HEARTBEAT_INTERVAL_SECS)

    async def watch_disconnect() -> None:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                return

    heartbeat_task = asyncio.create_task(heartbeat_loop())
    disconnect_task = asyncio.create_task(watch_disconnect())
    try:
        await asyncio.wait({heartbeat_task, disconnect_task}, return_when=asyncio.FIRST_COMPLETED)
    except WebSocketDisconnect:
        pass
    finally:
        heartbeat_task.cancel()
        disconnect_task.cancel()
        db.log_command(device_id=device_id, action="ws_disconnect", source_ip=source_ip or "unknown", ok=True)
        log.info("ws disconnected", extra={"device_id": device_id})
