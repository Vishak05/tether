import io
import os
import tempfile

os.environ.setdefault("TETHER_JWT_SECRET", "testsecret")
test_db_fd, test_db_path = tempfile.mkstemp(suffix=".db")
os.environ["TETHER_DB_PATH"] = test_db_path

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agent.core import auth, db
from agent.core import ip_filter
from agent.main import app
from agent.routes import files as files_route

client = TestClient(app)


# FastAPI's TestClient reports the fake client host "testclient" (not a real
# IP), which TailscaleIPMiddleware would always reject — that check is
# exercised separately in test_ip_filter.py. Bypassed here the same way
# test_ws_status.py bypasses it for the WS route.
@pytest.fixture(autouse=True)
def bypass_ip_filter(monkeypatch):
    monkeypatch.setattr(ip_filter, "_is_allowed", lambda *args, **kwargs: True)


@pytest.fixture(autouse=True)
def isolated_dirs(tmp_path, monkeypatch):
    """
    Points the files route at fresh temp directories for every test, via
    monkeypatch on the route module's already-imported names — NOT env vars.
    Env vars set here would be too late anyway (agent.core.config may already
    be imported/cached by another test module by the time this one runs,
    same cross-module caching quirk as TETHER_DB_PATH elsewhere in this
    suite) — and the real failure mode of getting this wrong isn't a test
    assertion failing, it's actually touching ~/Tether Outbox / ~/Tether
    Inbox on whoever's machine runs the suite, including deleting real files
    in clean_state()-style fixtures. Not worth risking.
    """
    outbox = tmp_path / "outbox"
    inbox = tmp_path / "inbox"
    outbox.mkdir()
    inbox.mkdir()
    monkeypatch.setattr(files_route, "OUTBOX_DIR", outbox)
    monkeypatch.setattr(files_route, "INBOX_DIR", inbox)
    monkeypatch.setattr(files_route, "MAX_UPLOAD_MB", 1)
    monkeypatch.setattr(files_route, "_MAX_UPLOAD_BYTES", 1 * 1024 * 1024)
    yield outbox, inbox


@pytest.fixture(autouse=True)
def clean_db():
    db.init_db()
    with db._conn() as con:
        con.execute("DELETE FROM command_audit_log")
        con.execute("DELETE FROM paired_devices")
    yield


def _auth_header() -> dict:
    device_id = "files-test-device"
    db.register_device(device_id, "Files Test Phone")
    token = auth.create_access_token(device_id)
    return {"Authorization": f"Bearer {token}"}


def test_list_outbox_reflects_files_on_disk(isolated_dirs):
    outbox, _ = isolated_dirs
    (outbox / "report.pdf").write_bytes(b"hello world")
    resp = client.get("/files/outbox", headers=_auth_header())
    assert resp.status_code == 200
    files = resp.json()["files"]
    assert len(files) == 1
    assert files[0]["name"] == "report.pdf"
    assert files[0]["size_bytes"] == len(b"hello world")


def test_download_outbox_file_returns_matching_bytes(isolated_dirs):
    outbox, _ = isolated_dirs
    content = b"the quick brown fox"
    (outbox / "note.txt").write_bytes(content)
    resp = client.get("/files/outbox/note.txt/download", headers=_auth_header())
    assert resp.status_code == 200
    assert resp.content == content


def test_download_rejects_path_traversal(isolated_dirs):
    resp = client.get("/files/outbox/..%2F..%2Fetc%2Fpasswd/download", headers=_auth_header())
    assert resp.status_code == 404


def test_download_missing_file_is_404(isolated_dirs):
    resp = client.get("/files/outbox/does-not-exist.txt/download", headers=_auth_header())
    assert resp.status_code == 404


def test_upload_lands_in_inbox_and_lists(isolated_dirs):
    headers = _auth_header()
    resp = client.post(
        "/files/inbox",
        headers=headers,
        files={"file": ("hello.txt", io.BytesIO(b"upload me"), "text/plain")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "hello.txt"
    assert body["size_bytes"] == len(b"upload me")

    listed = client.get("/files/inbox", headers=headers).json()["files"]
    assert len(listed) == 1
    assert listed[0]["name"] == "hello.txt"


def test_upload_deduplicates_filename_collisions(isolated_dirs):
    headers = _auth_header()
    client.post("/files/inbox", headers=headers, files={"file": ("dup.txt", io.BytesIO(b"one"), "text/plain")})
    resp = client.post("/files/inbox", headers=headers, files={"file": ("dup.txt", io.BytesIO(b"two"), "text/plain")})
    assert resp.status_code == 200
    assert resp.json()["name"] == "dup (1).txt"


def test_upload_rejects_oversized_file(isolated_dirs):
    _, inbox = isolated_dirs
    headers = _auth_header()
    too_big = b"x" * (2 * 1024 * 1024)  # 2 MB, cap is 1 MB
    resp = client.post(
        "/files/inbox",
        headers=headers,
        files={"file": ("big.bin", io.BytesIO(too_big), "application/octet-stream")},
    )
    assert resp.status_code == 413
    assert list(inbox.iterdir()) == []


def test_upload_sanitizes_unsafe_filename(isolated_dirs):
    headers = _auth_header()
    resp = client.post(
        "/files/inbox",
        headers=headers,
        files={"file": ("../../evil:name.txt", io.BytesIO(b"x"), "text/plain")},
    )
    assert resp.status_code == 200
    saved_name = resp.json()["name"]
    assert "/" not in saved_name and "\\" not in saved_name and ":" not in saved_name
