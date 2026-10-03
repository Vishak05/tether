"""
Tether Agent — Remote Terminal Routes

GET    /terminal                  — is the terminal usable by this device, plus its sessions
DELETE /terminal/sessions/{name}  — end a session and everything running in it
WS     /ws/terminal               — attach to a session (created on first attach)
GET    /terminal/page             — the xterm.js page the app shows in a WebView
GET    /terminal/vendor/{file}    — xterm.js, served locally rather than from a CDN

Access is checked on every request against agent/core/terminal.py (feature
on + this device allowed), on top of the normal token. The page and vendor
files carry no secrets, so they only sit behind the network IP filter; the
page receives its token from the app and uses it to open the socket.

WebSocket protocol (JSON text frames)
    phone -> agent  {"type": "input",  "data": "<keystrokes>"}
                    {"type": "resize", "cols": 80, "rows": 24}
    agent -> phone  {"type": "output", "data": "<terminal output>"}
                    {"type": "exit",   "reason": "ended" | "detached"}

Close codes
    4400 bad request (session name)          4401 bad token / revoked device
    4403 terminal off, device not allowed,   4408 idle timeout
         or LAN refused (Tailscale-only)     1011 couldn't start tmux
"""
import asyncio
import json
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from agent.core import auth, config, db, terminal
from agent.core.ip_filter import is_source_allowed, is_tailscale_source
from agent.core.logging import get_logger
from agent.os_layer import wsl_tmux

router = APIRouter(tags=["terminal"])
log = get_logger("tether.terminal")

_STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "terminal"
_VENDOR_FILES = {
    "xterm.js": "text/javascript",
    "xterm.css": "text/css",
    "addon-fit.js": "text/javascript",
}

_DEFAULT_SESSION = "tether"
_READ_CHUNK = 65536

_DENIAL_DETAIL = {
    "untrusted": "Device not trusted or has been revoked",
    "disabled": "The remote terminal is turned off on the laptop",
    "not_allowed": "This device isn't allowed to use the remote terminal",
}


# ── models ─────────────────────────────────────────────────────────────────────

class TerminalSession(BaseModel):
    name: str
    windows: int
    attached: int
    created: int
    activity: int


class TerminalState(BaseModel):
    enabled: bool
    allowed: bool
    device_id: str
    tailscale_only: bool
    via_tailscale: bool
    sessions: list[TerminalSession]
    error: str | None = None


# ── helpers ────────────────────────────────────────────────────────────────────

def _lan_refused(ip: str | None) -> bool:
    return config.TERMINAL_TAILSCALE_ONLY and not is_tailscale_source(ip)


def _require_terminal(request: Request, device_id: str) -> None:
    reason = terminal.denial_reason(device_id)
    if reason == "untrusted":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_DENIAL_DETAIL[reason])
    if reason:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_DENIAL_DETAIL[reason])
    if _lan_refused(request.client.host if request.client else None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The remote terminal only works over Tailscale")


def _clamp(raw: str | None, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(raw)))
    except (TypeError, ValueError):
        return default


# ── REST ───────────────────────────────────────────────────────────────────────

@router.get("/terminal", response_model=TerminalState, summary="Terminal access and sessions")
async def get_terminal(request: Request, device_id: str = Depends(auth.require_auth)) -> TerminalState:
    """
    Whether this device can use the terminal and, if so, the tmux sessions it
    can attach to. Sessions are only listed for an allowed device.
    """
    access = terminal.get_access()
    allowed = access.enabled and device_id in access.allowed_devices
    source_ip = request.client.host if request.client else None

    sessions: list[TerminalSession] = []
    error: str | None = None
    if allowed and not _lan_refused(source_ip):
        outcome = await asyncio.to_thread(wsl_tmux.list_sessions)
        if outcome["ok"]:
            sessions = [TerminalSession(**s) for s in outcome["result"]]
        else:
            error = outcome["error"]

    return TerminalState(
        enabled=access.enabled,
        allowed=allowed,
        device_id=device_id,
        tailscale_only=config.TERMINAL_TAILSCALE_ONLY,
        via_tailscale=is_tailscale_source(source_ip),
        sessions=sessions,
        error=error,
    )


@router.delete(
    "/terminal/sessions/{name}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="End a terminal session",
)
async def kill_terminal_session(
    name: str,
    request: Request,
    device_id: str = Depends(auth.require_auth),
) -> None:
    """Kill a tmux session and everything running in it. Attached clients are detached."""
    _require_terminal(request, device_id)
    if not wsl_tmux.SESSION_NAME_RE.match(name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session name")

    outcome = await asyncio.to_thread(wsl_tmux.kill_session, name)
    db.log_command(
        device_id=device_id,
        action="terminal_kill",
        source_ip=request.client.host if request.client else "unknown",
        ok=outcome["ok"],
        error=outcome.get("error"),
    )
    if not outcome["ok"]:
        # tmux words "not there" two ways: other sessions exist but not this
        # one, or no sessions exist at all (so no tmux server is running).
        if any(m in outcome["error"] for m in ("can't find session", "no server running")):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No session named {name!r}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=outcome["error"])
    log.info("terminal session killed", extra={"device_id": device_id, "session": name})


# ── page + vendored assets ─────────────────────────────────────────────────────

@router.get("/terminal/page", summary="Terminal page (loaded by the app's WebView)", include_in_schema=False)
async def terminal_page() -> FileResponse:
    return FileResponse(_STATIC_DIR / "index.html", media_type="text/html", headers={"Cache-Control": "no-cache"})


@router.get("/terminal/vendor/{filename}", include_in_schema=False)
async def terminal_vendor(filename: str) -> FileResponse:
    media_type = _VENDOR_FILES.get(filename)
    if media_type is None:      # fixed allow-list: nothing else in the tree is reachable
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return FileResponse(_STATIC_DIR / "vendor" / filename, media_type=media_type)


# ── WebSocket bridge ───────────────────────────────────────────────────────────

@router.websocket("/ws/terminal")
async def ws_terminal(websocket: WebSocket) -> None:
    source_ip = websocket.client.host if websocket.client else None

    # Same handshake shape as /ws/status: the IP middleware doesn't run for
    # WebSockets, and the token arrives as a query param. Refusals accept
    # first so the close code actually reaches the client.
    async def refuse(code: int, reason: str) -> None:
        await websocket.accept()
        await websocket.close(code=code, reason=reason)

    if not is_source_allowed(source_ip):
        log.warning("terminal rejected: source IP not allowed", extra={"source_ip": source_ip})
        return await refuse(4403, "forbidden: source IP not on Tailscale network or private LAN")
    if _lan_refused(source_ip):
        log.warning("terminal rejected: LAN connection while Tailscale-only", extra={"source_ip": source_ip})
        return await refuse(4403, "tailscale only")

    device_id: str | None = None
    token = websocket.query_params.get("token")
    if token:
        try:
            device_id = auth.verify_token(token, expected_type="access")
        except Exception:
            device_id = None
    if not device_id:
        return await refuse(4401, "unauthorized")

    reason = terminal.denial_reason(device_id)
    if reason:
        log.warning("terminal rejected", extra={"device_id": device_id, "reason": reason})
        return await refuse(4401 if reason == "untrusted" else 4403, reason)

    name = websocket.query_params.get("session") or _DEFAULT_SESSION
    if not wsl_tmux.SESSION_NAME_RE.match(name):
        return await refuse(4400, "invalid session name")
    cols = _clamp(websocket.query_params.get("cols"), 80, 10, 500)
    rows = _clamp(websocket.query_params.get("rows"), 24, 4, 200)

    await websocket.accept()

    spawned = await asyncio.to_thread(wsl_tmux.spawn_client, name, cols, rows)
    if not spawned["ok"]:
        log.error("terminal spawn failed", extra={"device_id": device_id, "error": spawned["error"]})
        db.log_command(device_id=device_id, action="terminal_attach", source_ip=source_ip or "unknown",
                       ok=False, error=spawned["error"])
        await websocket.close(code=1011, reason="couldn't start tmux")
        return
    proc = spawned["result"]

    db.log_command(device_id=device_id, action="terminal_attach", source_ip=source_ip or "unknown", ok=True)
    log.info("terminal attached", extra={"device_id": device_id, "session": name, "source_ip": source_ip})

    last_input = time.monotonic()

    async def pump_output() -> str:
        while True:
            try:
                # read() blocks until output arrives; terminate() in the
                # finally block below unblocks it with EOFError.
                data = await asyncio.to_thread(proc.read, _READ_CHUNK)
            except EOFError:
                return "exit"
            if data:
                await websocket.send_json({"type": "output", "data": data})

    async def pump_input() -> str:
        nonlocal last_input
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                return "disconnect"
            try:
                payload = json.loads(message.get("text") or "")
            except ValueError:
                continue
            if not isinstance(payload, dict):
                continue
            kind = payload.get("type")
            if kind == "input" and isinstance(payload.get("data"), str):
                last_input = time.monotonic()
                await asyncio.to_thread(proc.write, payload["data"])
            elif kind == "resize":
                c = _clamp(payload.get("cols"), cols, 10, 500)
                r = _clamp(payload.get("rows"), rows, 4, 200)
                proc.setwinsize(r, c)

    async def watchdog() -> str:
        # Access is re-checked while connected, not just at the handshake, so
        # revoking the device or switching the terminal off cuts in promptly.
        while True:
            await asyncio.sleep(config.TERMINAL_RECHECK_SECS)
            denied = terminal.denial_reason(device_id)
            if denied:
                return f"denied:{denied}"
            if time.monotonic() - last_input > config.TERMINAL_IDLE_TIMEOUT_SECS:
                return "idle"

    tasks = [asyncio.create_task(t()) for t in (pump_output, pump_input, watchdog)]
    outcome = "disconnect"
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finished = done.pop()
        outcome = finished.result() if not finished.exception() else "disconnect"

        if outcome == "exit":
            # The tmux client went away on its own: the session ended (last
            # shell exited, or it was killed), or it was detached (prefix+d).
            listed = await asyncio.to_thread(wsl_tmux.list_sessions)
            still_there = listed["ok"] and any(s["name"] == name for s in listed["result"])
            await websocket.send_json({"type": "exit", "reason": "detached" if still_there else "ended"})
            await websocket.close(code=1000)
        elif outcome == "idle":
            await websocket.close(code=4408, reason="idle timeout")
        elif outcome.startswith("denied:"):
            denied = outcome.split(":", 1)[1]
            await websocket.close(code=4401 if denied == "untrusted" else 4403, reason=denied)
    except Exception:
        pass   # the socket is already gone; nothing left to tell the phone
    finally:
        for task in tasks:
            task.cancel()
        try:
            # Detaches this client only — the tmux session keeps running.
            # Called directly, not via to_thread: this block also runs when
            # the handler is cancelled (server shutdown), where a further
            # await may never resume and the client would be left attached.
            proc.terminate(True)
        except Exception:
            log.exception("terminal client terminate failed")
        db.log_command(device_id=device_id, action="terminal_detach", source_ip=source_ip or "unknown", ok=True)
        log.info("terminal detached", extra={"device_id": device_id, "session": name, "outcome": outcome})
