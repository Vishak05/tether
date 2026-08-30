"""
Tests for the proximity auto-lock HTTP routes.

Bluetooth is mocked throughout — nothing here touches a real radio.
"""
import os
import tempfile

os.environ.setdefault("TETHER_JWT_SECRET", "testsecret")
test_db_fd, test_db_path = tempfile.mkstemp(suffix=".db")
os.environ.setdefault("TETHER_DB_PATH", test_db_path)

from unittest import mock

import pytest
from fastapi.testclient import TestClient

from agent.core import auth, db, ip_filter, proximity
from agent.main import app
from agent.routes import proximity as proximity_route

client = TestClient(app)


# TestClient reports the fake host "testclient", which TailscaleIPMiddleware
# would reject; that check has its own tests in test_ip_filter.py.
@pytest.fixture(autouse=True)
def bypass_ip_filter(monkeypatch):
    monkeypatch.setattr(ip_filter, "_is_allowed", lambda *args, **kwargs: True)


@pytest.fixture(autouse=True)
def clean_db():
    db.init_db()
    with db._conn() as con:
        con.execute("DELETE FROM command_audit_log")
        con.execute("DELETE FROM paired_devices")
        con.execute("DELETE FROM agent_settings")
    proximity.SERVICE.on_settings_changed()
    yield


def _auth_header() -> dict:
    device_id = "proximity-test-device"
    db.register_device(device_id, "Proximity Test Phone")
    return {"Authorization": f"Bearer {auth.create_access_token(device_id)}"}


def test_rejects_requests_with_no_credentials():
    """
    403 rather than 401: FastAPI's HTTPBearer rejects a missing Authorization
    header before require_auth is ever reached. (require_auth's own 401 for a
    bad token is covered in test_auth.py, and by the test below.)
    """
    assert client.get("/proximity").status_code == 403
    assert client.patch("/proximity", json={"enabled": True}).status_code == 403
    assert client.get("/proximity/bonded").status_code == 403


def test_rejects_an_invalid_token():
    bad = {"Authorization": "Bearer not-a-real-token"}
    assert client.get("/proximity", headers=bad).status_code == 401
    assert client.patch("/proximity", json={"enabled": True}, headers=bad).status_code == 401
    assert client.get("/proximity/bonded", headers=bad).status_code == 401


def test_get_returns_defaults_on_a_fresh_db():
    resp = client.get("/proximity", headers=_auth_header())
    assert resp.status_code == 200
    body = resp.json()
    # Disabled with no target: a feature that locks the machine must be opt-in.
    assert body["enabled"] is False
    assert body["target_mac"] is None
    assert body["present"] is None          # nothing probed yet
    assert body["miss_threshold"] == 3


def test_enabling_without_a_target_is_rejected():
    """
    Otherwise the loop would look for nothing, find nothing, and lock the
    machine on every re-arm.
    """
    resp = client.patch("/proximity", json={"enabled": True}, headers=_auth_header())
    assert resp.status_code == 400
    assert "target device" in resp.json()["detail"].lower()


def test_bare_hex_mac_is_normalised_on_write():
    resp = client.patch(
        "/proximity",
        json={"target_mac": "5879e0a6c785", "target_name": "My Phone"},
        headers=_auth_header(),
    )
    assert resp.status_code == 200
    assert resp.json()["target_mac"] == "58:79:E0:A6:C7:85"
    assert proximity.get_settings().target_mac == "58:79:E0:A6:C7:85"


def test_invalid_mac_is_rejected():
    resp = client.patch("/proximity", json={"target_mac": "not-a-mac"}, headers=_auth_header())
    assert resp.status_code == 400


def test_out_of_range_poll_interval_is_rejected_by_validation():
    resp = client.patch("/proximity", json={"poll_interval_secs": 1}, headers=_auth_header())
    assert resp.status_code == 422


def test_enable_after_setting_a_target_succeeds_and_persists():
    headers = _auth_header()
    client.patch("/proximity", json={"target_mac": "58:79:E0:A6:C7:85"}, headers=headers)
    resp = client.patch("/proximity", json={"enabled": True}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True

    # Survives a re-read, i.e. it actually reached the DB rather than living
    # in process memory — the loop re-reads settings every tick.
    assert proximity.get_settings().enabled is True


def test_settings_change_resets_accumulated_state():
    """Switching phones must not inherit the previous one's miss streak."""
    headers = _auth_header()
    proximity.SERVICE._tracker = proximity.ProximityTracker(3)
    proximity.SERVICE._tracker.record_sighting(False)
    proximity.SERVICE._tracker.record_sighting(False)

    client.patch("/proximity", json={"target_mac": "AA:BB:CC:DD:EE:FF"}, headers=headers)

    assert proximity.SERVICE.snapshot()["consecutive_misses"] == 0


def test_bonded_list_is_returned():
    fake = {"ok": True, "result": [{"mac": "58:79:E0:A6:C7:85", "name": "Vishak's A55"}]}
    with mock.patch.object(proximity_route.bluetooth, "list_bonded_devices", return_value=fake):
        resp = client.get("/proximity/bonded", headers=_auth_header())
    assert resp.status_code == 200
    assert resp.json()["devices"] == [{"mac": "58:79:E0:A6:C7:85", "name": "Vishak's A55"}]


def test_bonded_list_failure_is_surfaced():
    fake = {"ok": False, "error": "registry unreadable"}
    with mock.patch.object(proximity_route.bluetooth, "list_bonded_devices", return_value=fake):
        resp = client.get("/proximity/bonded", headers=_auth_header())
    assert resp.status_code == 503
