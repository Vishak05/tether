"""
Tests for the remote terminal: access control, REST routes, the WebSocket
bridge, and tmux output parsing.

WSL, tmux and the pseudo-console are faked throughout — FakePty stands in for
the attached tmux client and echoes what it's sent.
"""
import os
import tempfile

os.environ.setdefault("TETHER_JWT_SECRET", "testsecret")
test_db_fd, test_db_path = tempfile.mkstemp(suffix=".db")
os.environ.setdefault("TETHER_DB_PATH", test_db_path)

import queue
import subprocess
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from agent.core import auth, config, db, ip_filter, terminal
from agent.main import app
from agent.os_layer import wsl_tmux
from agent.routes import terminal as terminal_route

client = TestClient(app)

DEVICE = "terminal-test-device"


class FakePty:
    """Echoes each write back as output; terminate() ends the read loop."""

    def __init__(self) -> None:
        self._out: queue.Queue = queue.Queue()
        self.writes: list[str] = []
        self.sizes: list[tuple[int, int]] = []
        self.terminated = False

    def read(self, size: int) -> str:
        item = self._out.get(timeout=30)
        if item is None:
            raise EOFError
        return item

    def write(self, data: str) -> int:
        self.writes.append(data)
        self._out.put(f"echo:{data}")
        return len(data)

    def setwinsize(self, rows: int, cols: int) -> None:
        self.sizes.append((rows, cols))

    def end(self) -> None:
        """Simulate the tmux client exiting on its own."""
        self._out.put(None)

    def terminate(self, force: bool = False) -> None:
        self.terminated = True
        self._out.put(None)


# TestClient reports the fake host "testclient"; the IP checks have their own
# tests in test_ip_filter.py.
@pytest.fixture(autouse=True)
def bypass_ip_filter(monkeypatch):
    monkeypatch.setattr(ip_filter, "_is_allowed", lambda *args, **kwargs: True)
    monkeypatch.setattr(terminal_route, "is_source_allowed", lambda ip: True)


@pytest.fixture(autouse=True)
def clean_db():
    db.init_db()
    with db._conn() as con:
        con.execute("DELETE FROM command_audit_log")
        con.execute("DELETE FROM paired_devices")
        con.execute("DELETE FROM agent_settings")
    yield


@pytest.fixture
def fake_pty(monkeypatch):
    pty = FakePty()
    monkeypatch.setattr(wsl_tmux, "spawn_client", lambda name, cols, rows: {"ok": True, "result": pty})
    monkeypatch.setattr(wsl_tmux, "list_sessions", lambda: {"ok": True, "result": []})
    return pty


def _token(device_id: str = DEVICE) -> str:
    db.register_device(device_id, "Terminal Test Phone")
    return auth.create_access_token(device_id)


def _headers(device_id: str = DEVICE) -> dict:
    return {"Authorization": f"Bearer {_token(device_id)}"}


def _grant(device_id: str = DEVICE) -> None:
    terminal.set_enabled(True)
    terminal.allow_device(device_id)


def _close_code(url: str) -> tuple[int, str]:
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(url) as ws:
            ws.receive_json()
    return exc.value.code, exc.value.reason


# ── access control ────────────────────────────────────────────────────────────

def test_terminal_is_off_and_nobody_is_allowed_by_default():
    access = terminal.get_access()
    assert access.enabled is False
    assert access.allowed_devices == frozenset()


def test_allow_and_deny_persist():
    terminal.allow_device("a")
    terminal.allow_device("b")
    terminal.deny_device("a")
    assert terminal.get_access().allowed_devices == frozenset({"b"})


def test_denial_reasons_in_order():
    assert terminal.denial_reason("never-paired") == "untrusted"
    _token()
    assert terminal.denial_reason(DEVICE) == "disabled"
    terminal.set_enabled(True)
    assert terminal.denial_reason(DEVICE) == "not_allowed"
    terminal.allow_device(DEVICE)
    assert terminal.denial_reason(DEVICE) is None
    db.revoke_device(DEVICE)
    assert terminal.denial_reason(DEVICE) == "untrusted"


def test_corrupt_allow_list_reads_as_empty():
    db.set_setting("terminal.allowed_devices", "{not json")
    assert terminal.get_access().allowed_devices == frozenset()


# ── REST ──────────────────────────────────────────────────────────────────────

def test_get_requires_credentials():
    assert client.get("/terminal").status_code == 403


def test_get_when_disabled_lists_nothing_and_never_touches_wsl():
    with mock.patch.object(wsl_tmux, "list_sessions") as listing:
        resp = client.get("/terminal", headers=_headers())
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is False
    assert body["allowed"] is False
    assert body["device_id"] == DEVICE
    assert body["sessions"] == []
    listing.assert_not_called()


def test_get_when_enabled_but_device_not_allowed():
    headers = _headers()
    terminal.set_enabled(True)
    with mock.patch.object(wsl_tmux, "list_sessions") as listing:
        body = client.get("/terminal", headers=headers).json()
    assert body["enabled"] is True
    assert body["allowed"] is False
    listing.assert_not_called()


def test_get_lists_sessions_for_an_allowed_device():
    headers = _headers()
    _grant()
    session = {"name": "tether", "windows": 2, "attached": 1, "created": 1700000000, "activity": 1700000100}
    with mock.patch.object(wsl_tmux, "list_sessions", return_value={"ok": True, "result": [session]}):
        body = client.get("/terminal", headers=headers).json()
    assert body["allowed"] is True
    assert body["sessions"] == [session]
    assert body["error"] is None


def test_get_reports_wsl_errors_instead_of_failing():
    headers = _headers()
    _grant()
    with mock.patch.object(wsl_tmux, "list_sessions", return_value={"ok": False, "error": "WSL did not respond"}):
        body = client.get("/terminal", headers=headers).json()
    assert body["sessions"] == []
    assert body["error"] == "WSL did not respond"


def test_kill_is_refused_for_a_device_that_isnt_allowed():
    headers = _headers()
    terminal.set_enabled(True)
    with mock.patch.object(wsl_tmux, "kill_session") as kill:
        resp = client.delete("/terminal/sessions/tether", headers=headers)
    assert resp.status_code == 403
    kill.assert_not_called()


def test_kill_rejects_an_invalid_session_name():
    headers = _headers()
    _grant()
    assert client.delete("/terminal/sessions/bad.name", headers=headers).status_code == 400


def test_kill_succeeds_and_is_audited():
    headers = _headers()
    _grant()
    with mock.patch.object(wsl_tmux, "kill_session", return_value={"ok": True, "result": None}) as kill:
        resp = client.delete("/terminal/sessions/tether", headers=headers)
    assert resp.status_code == 204
    kill.assert_called_once_with("tether")
    assert "terminal_kill" in {r["action"] for r in db.get_audit_log(device_id=DEVICE)}


def test_kill_of_a_missing_session_is_404():
    headers = _headers()
    _grant()
    for error in ("can't find session: nope", "no server running on /tmp/tmux-1000/default"):
        missing = {"ok": False, "error": error}
        with mock.patch.object(wsl_tmux, "kill_session", return_value=missing):
            assert client.delete("/terminal/sessions/nope", headers=headers).status_code == 404


# ── page + vendored assets ────────────────────────────────────────────────────

def test_page_and_vendor_files_are_served():
    page = client.get("/terminal/page")
    assert page.status_code == 200
    assert "xterm" in page.text
    assert client.get("/terminal/vendor/xterm.js").status_code == 200
    assert client.get("/terminal/vendor/xterm.css").status_code == 200
    assert client.get("/terminal/vendor/addon-fit.js").status_code == 200


def test_vendor_route_only_serves_its_allow_list():
    assert client.get("/terminal/vendor/LICENSE.xterm").status_code == 404
    assert client.get("/terminal/vendor/..%2Findex.html").status_code == 404


# ── WebSocket handshake ───────────────────────────────────────────────────────

def test_ws_rejects_a_bad_token():
    assert _close_code("/ws/terminal?token=nope")[0] == 4401


def test_ws_rejects_when_the_terminal_is_off(fake_pty):
    token = _token()
    code, reason = _close_code(f"/ws/terminal?token={token}")
    assert (code, reason) == (4403, "disabled")


def test_ws_rejects_a_device_that_isnt_allowed(fake_pty):
    token = _token()
    terminal.set_enabled(True)
    code, reason = _close_code(f"/ws/terminal?token={token}")
    assert (code, reason) == (4403, "not_allowed")


def test_ws_rejects_a_revoked_device(fake_pty):
    token = _token()
    _grant()
    db.revoke_device(DEVICE)
    assert _close_code(f"/ws/terminal?token={token}")[0] == 4401


def test_ws_rejects_an_invalid_session_name(fake_pty):
    token = _token()
    _grant()
    assert _close_code(f"/ws/terminal?token={token}&session=a:b")[0] == 4400


def test_ws_tailscale_only_refuses_lan_connections(fake_pty, monkeypatch):
    token = _token()
    _grant()
    monkeypatch.setattr(config, "TERMINAL_TAILSCALE_ONLY", True)
    monkeypatch.setattr(terminal_route, "is_tailscale_source", lambda ip: False)
    assert _close_code(f"/ws/terminal?token={token}") == (4403, "tailscale only")


def test_ws_reports_a_failed_tmux_start(monkeypatch):
    token = _token()
    _grant()
    monkeypatch.setattr(wsl_tmux, "spawn_client", lambda *a: {"ok": False, "error": "wsl.exe not found"})
    assert _close_code(f"/ws/terminal?token={token}")[0] == 1011


# ── WebSocket bridge ──────────────────────────────────────────────────────────

def test_ws_bridges_input_output_and_resize(fake_pty):
    token = _token()
    _grant()
    with client.websocket_connect(f"/ws/terminal?token={token}&session=work&cols=100&rows=30") as ws:
        ws.send_json({"type": "input", "data": "ls\r"})
        assert ws.receive_json() == {"type": "output", "data": "echo:ls\r"}

        ws.send_json({"type": "resize", "cols": 120, "rows": 40})
        ws.send_text("not json")                        # ignored, not fatal
        ws.send_json({"type": "input", "data": "pwd\r"})
        assert ws.receive_json() == {"type": "output", "data": "echo:pwd\r"}

    assert fake_pty.writes == ["ls\r", "pwd\r"]
    assert fake_pty.sizes == [(40, 120)]


def test_ws_disconnect_detaches_and_is_audited(fake_pty):
    token = _token()
    _grant()
    with client.websocket_connect(f"/ws/terminal?token={token}") as ws:
        ws.send_json({"type": "input", "data": "x"})
        ws.receive_json()

    assert fake_pty.terminated is True
    actions = [r["action"] for r in db.get_audit_log(device_id=DEVICE)]
    assert "terminal_attach" in actions
    assert "terminal_detach" in actions


def test_ws_reports_a_session_that_ended(fake_pty):
    token = _token()
    _grant()
    with client.websocket_connect(f"/ws/terminal?token={token}") as ws:
        fake_pty.end()
        assert ws.receive_json() == {"type": "exit", "reason": "ended"}


def test_ws_reports_a_detach_when_the_session_lives_on(fake_pty, monkeypatch):
    token = _token()
    _grant()
    alive = {"name": "tether", "windows": 1, "attached": 0, "created": 0, "activity": 0}
    monkeypatch.setattr(wsl_tmux, "list_sessions", lambda: {"ok": True, "result": [alive]})
    with client.websocket_connect(f"/ws/terminal?token={token}") as ws:
        fake_pty.end()
        assert ws.receive_json() == {"type": "exit", "reason": "detached"}


def test_ws_drops_an_idle_phone(fake_pty, monkeypatch):
    token = _token()
    _grant()
    monkeypatch.setattr(config, "TERMINAL_RECHECK_SECS", 0.05)
    monkeypatch.setattr(config, "TERMINAL_IDLE_TIMEOUT_SECS", 0.1)
    assert _close_code(f"/ws/terminal?token={token}") == (4408, "idle timeout")
    assert fake_pty.terminated is True


def test_ws_cuts_off_a_device_denied_mid_session(fake_pty, monkeypatch):
    token = _token()
    _grant()
    monkeypatch.setattr(config, "TERMINAL_RECHECK_SECS", 0.05)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/terminal?token={token}") as ws:
            terminal.deny_device(DEVICE)
            ws.receive_json()
    assert (exc.value.code, exc.value.reason) == (4403, "not_allowed")


# ── tmux output parsing ───────────────────────────────────────────────────────

def _completed(returncode: int, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess([], returncode, stdout.encode(), stderr.encode())


def test_list_sessions_parses_tmux_output():
    out = "tether\t2\t1\t1700000000\t1700000100\nwork\t1\t0\t1700000200\t1700000300\n"
    with mock.patch.object(wsl_tmux, "_tmux", return_value=_completed(0, out)):
        result = wsl_tmux.list_sessions()
    assert result["ok"] is True
    assert [s["name"] for s in result["result"]] == ["tether", "work"]
    assert result["result"][0]["windows"] == 2
    assert result["result"][0]["attached"] == 1


def test_list_sessions_with_no_tmux_server_is_empty_not_an_error():
    msg = "no server running on /tmp/tmux-1000/default"
    with mock.patch.object(wsl_tmux, "_tmux", return_value=_completed(1, stderr=msg)):
        assert wsl_tmux.list_sessions() == {"ok": True, "result": []}


def test_list_sessions_surfaces_real_failures():
    with mock.patch.object(wsl_tmux, "_tmux", return_value=_completed(1, stderr="execvpe(tmux) failed")):
        result = wsl_tmux.list_sessions()
    assert result["ok"] is False
    assert "tmux" in result["error"]


def test_list_sessions_strips_utf16_nuls_from_wsl_errors():
    utf16ish = "W\x00S\x00L\x00 \x00e\x00r\x00r\x00o\x00r\x00"
    with mock.patch.object(wsl_tmux, "_tmux", return_value=_completed(1, stderr=utf16ish)):
        assert wsl_tmux.list_sessions()["error"] == "WSL error"


def test_session_names_are_validated_before_reaching_tmux():
    with mock.patch.object(wsl_tmux, "_tmux") as tmux:
        assert wsl_tmux.kill_session("x; rm -rf ~")["ok"] is False
        assert wsl_tmux.kill_session("a.b")["ok"] is False
    tmux.assert_not_called()
    assert wsl_tmux.spawn_client("a:b", 80, 24)["ok"] is False
