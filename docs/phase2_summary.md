# Phase 2 Summary: Auth + Security

## Overview
Phase 2 focused on hardening the Tether agent by introducing a robust pairing flow, JWT-based authentication, and a permanent SQLite audit trail for all executed commands. The agent now requires an explicit pairing step before a mobile device can issue commands, ensuring that the control loop is secure even when exposed to a network.

## Key Additions

### 1. Persistence Layer (`core/db.py`)
- **SQLite Database:** Introduced a local SQLite database stored at `~/.tether/tether.db`. It runs in WAL (Write-Ahead Logging) mode to handle concurrent reads smoothly.
- **`paired_devices` Table:** Tracks all devices that have successfully paired with the laptop. It stores the device ID (UUID), a human-readable name, the pairing timestamp, and the last time the device was seen.
- **`command_audit_log` Table:** Provides a non-repudiable audit trail. Every command (lock, sleep, volume, wifi, screenshot) logs the action, the invoking device ID, the source IP, and whether the command succeeded or failed.

### 2. JWT Authentication (`core/auth.py`)
- **JSON Web Tokens (JWT):** Integrated the `python-jose` library to sign and verify tokens.
- **Secret Management:** The agent auto-generates a highly secure, 32-byte signing secret on first run and persists it to `~/.tether/secret.key`.
- **Token Types:** 
  - **Access Tokens:** Short-lived (15 minutes) tokens sent with every command request.
  - **Refresh Tokens:** Long-lived (30 days) tokens used to request new access tokens without requiring the user to scan a QR code again.
- **FastAPI Dependency (`require_auth`):** All sensitive endpoints are now protected by this dependency, which verifies the JWT signature, checks for expiration, and ensures the device hasn't been revoked in the SQLite database.

### 3. The Pairing Flow (`routes/pair.py` & `routes/auth.py`)
- **Initiation (`GET /pair`):** When called locally on the laptop, this endpoint generates a one-time URL-safe token. It returns this token alongside a base64-encoded QR code PNG. The QR code encodes a custom URI (`tether://pair?token=...`) that the mobile app will scan.
- **Completion (`POST /auth/pair`):** The mobile app sends the one-time token back to the laptop. The agent validates it (ensuring it's only used once), assigns a permanent UUID to the phone, registers it in the database, and returns the initial JWT access and refresh tokens.

### 4. Device Management (`routes/devices.py`)
- **Listing (`GET /devices`):** Returns a list of all currently trusted devices.
- **Revocation (`DELETE /devices/{device_id}`):** Allows a user (from their phone) to revoke access for any paired device. Once revoked, any subsequent requests using that device's JWTs are immediately rejected.

### 5. Endpoint Hardening
- The `commands.py` and `status.py` routers were updated so every endpoint requires the `require_auth` dependency.
- The OS dispatcher functions now receive the authenticated `device_id` and automatically log the command outcome to the SQLite database.

## Next Steps (Phase 3)
With security and persistence in place, Phase 3 will introduce **Tailscale integration**. We will update the FastAPI CORS configuration and add IP validation middleware to ensure requests are restricted to the Tailscale CIDR, allowing you to securely control your laptop from anywhere in the world.
