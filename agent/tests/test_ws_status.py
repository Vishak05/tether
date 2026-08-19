import os
import tempfile

os.environ.setdefault("TETHER_JWT_SECRET", "testsecret")
test_db_fd, test_db_path = tempfile.mkstemp(suffix=".db")
os.environ["TETHER_DB_PATH"] = test_db_path

import pytest
from fastapi.testclient import TestClient

from agent.core import auth, db
from agent.main import app
from agent.routes import ws_status

# FastAPI's TestClient reports the fake client host "testclient" (not a real
# IP) on every request, which agent/core/ip_filter.is_source_allowed() would
# always reject — that check is exercised separately and thoroughly in
# test_ip_filter.py. These tests are about the auth/trust handshake in
# ws_status.py, so the IP check is bypassed here rather than faked out with a
# non-representative client address.
@pytest.fixture(autouse=True)
def bypass_ip_filter(monkeypatch):
    monkeypatch.setattr(ws_status, "is_source_allowed", lambda ip: True)


@pytest.fixture(autouse=True)
def clean_db():
    db.init_db()
    with db._conn() as con:
        con.execute("DELETE FROM command_audit_log")
        con.execute("DELETE FROM paired_devices")
    yield


def _register_device(device_id: str = "ws-device-1") -> str:
    db.register_device(device_id, "WS Test Phone")
    return auth.create_access_token(device_id)


def test_ws_status_streams_heartbeat_for_trusted_device():
    token = _register_device()
    client = TestClient(app)
    with client.websocket_connect(f"/ws/status?token={token}") as ws:
        message = ws.receive_json()
        assert message["type"] == "heartbeat"
        assert "ts" in message
        assert "battery" in message
        assert "active_window" in message
        assert "locked" in message


def test_ws_status_rejects_missing_token():
    client = TestClient(app)
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/status") as ws:
            ws.receive_json()


def test_ws_status_rejects_invalid_token():
    client = TestClient(app)
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/status?token=not-a-real-token") as ws:
            ws.receive_json()


def test_ws_status_rejects_revoked_device():
    device_id = "ws-device-revoked"
    token = _register_device(device_id)
    db.revoke_device(device_id)
    client = TestClient(app)
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/status?token={token}") as ws:
            ws.receive_json()


def test_ws_connect_and_disconnect_are_audited():
    device_id = "ws-device-audit"
    token = _register_device(device_id)
    client = TestClient(app)
    with client.websocket_connect(f"/ws/status?token={token}") as ws:
        ws.receive_json()

    logs = db.get_audit_log(device_id=device_id)
    actions = {row["action"] for row in logs}
    assert "ws_connect" in actions
    assert "ws_disconnect" in actions
