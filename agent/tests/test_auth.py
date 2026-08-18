import os
from unittest import mock

import pytest
from fastapi import HTTPException

from agent.core import auth

# Use a deterministic secret for testing
os.environ["TETHER_JWT_SECRET"] = "testsecret"
# Force low TTLs for testing expiration
os.environ["TETHER_ACCESS_TTL"] = "1"
os.environ["TETHER_REFRESH_TTL"] = "2"


def test_create_and_verify_access_token():
    device_id = "test-device-123"
    token = auth.create_access_token(device_id)
    assert isinstance(token, str)

    verified_id = auth.verify_token(token, expected_type="access")
    assert verified_id == device_id


def test_create_and_verify_refresh_token():
    device_id = "test-device-456"
    token = auth.create_refresh_token(device_id)
    assert isinstance(token, str)

    verified_id = auth.verify_token(token, expected_type="refresh")
    assert verified_id == device_id


def test_wrong_token_type():
    device_id = "test-device-789"
    access_token = auth.create_access_token(device_id)

    with pytest.raises(HTTPException) as excinfo:
        auth.verify_token(access_token, expected_type="refresh")
    assert excinfo.value.status_code == 401
    assert "Expected refresh token" in excinfo.value.detail


def test_invalid_token():
    with pytest.raises(HTTPException) as excinfo:
        auth.verify_token("invalid.token.string")
    assert excinfo.value.status_code == 401
    assert "Invalid token" in excinfo.value.detail


def test_expired_token():
    from jose import ExpiredSignatureError
    
    device_id = "expired-device"
    token = auth.create_access_token(device_id)
    
    with mock.patch("agent.core.auth.jwt.decode", side_effect=ExpiredSignatureError):
        with pytest.raises(HTTPException) as excinfo:
            auth.verify_token(token)
            
    assert excinfo.value.status_code == 401
    assert "Token has expired" in excinfo.value.detail
