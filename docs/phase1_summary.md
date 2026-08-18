# Phase 1 — FastAPI Agent Foundation

> **Status:** ✅ Complete  
> **Scope:** Laptop-side agent, 5 core commands, no auth, same-wifi only

---

## What Was Built

A Python **FastAPI** service that runs on the laptop and exposes a clean HTTP API
for the mobile app to call. This is the "brain" of the Tether system — every
remote control command flows through it.

### Files

```
tether/
├── agent/
│   ├── main.py                  ← FastAPI app factory (CORS, routers, lifespan)
│   ├── core/
│   │   ├── config.py            ← Settings: host, port, laptop ID, OS detection
│   │   └── logging.py           ← Structured JSON logger
│   ├── os_layer/
│   │   └── windows.py           ← All Windows system calls live here
│   ├── routes/
│   │   ├── commands.py          ← 5 command endpoints
│   │   └── status.py            ← /status health snapshot
│   └── requirements.txt
└── run.py                       ← Dev server launcher (hot-reload)
```

---

## Concepts & Design Decisions

### 1. FastAPI as the Agent Framework

FastAPI was chosen over Flask or Django for three reasons:
- **Async-native** — essential for Phase 5 WebSocket support without threading hacks.
- **Auto-generated docs** — visiting `http://localhost:8765/docs` gives a full interactive API explorer (Swagger UI), making testing easy.
- **Pydantic models** — request/response bodies are validated automatically with clean error messages.

### 2. The OS Layer Pattern

All Windows system calls are isolated in `agent/os_layer/windows.py`. No other file imports `ctypes`, `subprocess`, or `win32gui` directly.

**Why?**
- **Testability** — the route handlers can be tested with a mock OS layer.
- **Portability** — Phase 4 adds `linux.py` alongside `windows.py`; the routes
  never need to change.
- **Clarity** — a developer reading `routes/commands.py` sees *what* the command
  does, not *how* the OS implements it.

Every OS layer function returns a uniform dict:

```python
{"ok": True,  "result": <payload>}  # success
{"ok": False, "error": <message>}   # failure
```

### 3. The Five Core Commands

| Endpoint | Method | OS Mechanism | Notes |
|---|---|---|---|
| `/commands/lock` | POST | `ctypes.windll.user32.LockWorkStation()` | Instant, no confirmation |
| `/commands/sleep` | POST | `ctypes.windll.powrprof.SetSuspendState()` | S3 sleep, wakes on input |
| `/commands/volume` | POST | `pycaw` (Windows Core Audio API) | 0–100 integer, validated by Pydantic |
| `/commands/wifi` | POST | `netsh interface set interface` | `enable: null` toggles current state |
| `/commands/screenshot` | GET | `PIL.ImageGrab.grab()` | Returns base64 JPEG, quality 70 |

### 4. Volume Control via pycaw

Instead of shelling out to external tools (nircmd), we use **pycaw** — a Python
wrapper around the Windows Core Audio (`IAudioEndpointVolume`) COM interface.
This means:
- No external binaries to install.
- Reliable floating-point volume control (0.0–1.0 scalar).
- Works across all Windows 10/11 builds.

A PowerShell fallback exists if pycaw isn't importable.

### 5. Screenshot Encoding

Screenshots are captured with `PIL.ImageGrab`, compressed to JPEG (quality 70),
then base64-encoded into a JSON string. This trades some image fidelity for
network efficiency — a typical 1080p screenshot becomes ~150–300 KB of base64
text vs. ~2 MB as PNG.

The mobile app (Phase 3) decodes this with a single `atob()` / React Native
`Image` component call.

### 6. Structured JSON Logging

Every command execution is logged as a single JSON line:

```json
{
  "ts": "2026-08-17T18:05:00.123Z",
  "level": "INFO",
  "laptop_id": "DESKTOP-ABC123",
  "logger": "tether.commands",
  "msg": "command executed",
  "action": "volume",
  "ok": true,
  "source_ip": "192.168.1.42",
  "result": {"volume": 60}
}
```

Phase 2 will add a SQLite handler that persists these records as the audit trail.

### 7. App Factory Pattern

`main.py` uses `create_app()` rather than a module-level `app = FastAPI()`.
This makes it easy to:
- Create the app with different configs in tests.
- Mount the Phase 5 WebSocket router without touching existing router registrations.
- Run multiple instances with different ports in integration tests.

---

## How to Run

```bash
# 1. Install dependencies (once)
pip install -r agent/requirements.txt

# 2. Start the agent
python run.py

# 3. Open the interactive docs
#    http://127.0.0.1:8765/docs
```

### Testing with curl

```bash
# Health check
curl http://localhost:8765/

# Status snapshot
curl http://localhost:8765/status

# Lock the workstation
curl -X POST http://localhost:8765/commands/lock

# Set volume to 60%
curl -X POST http://localhost:8765/commands/volume \
     -H "Content-Type: application/json" \
     -d '{"level": 60}'

# Take a screenshot (save the base64 data to file)
curl http://localhost:8765/commands/screenshot | python -c \
  "import sys, json, base64; d=json.load(sys.stdin); open('shot.jpg','wb').write(base64.b64decode(d['result']['data_base64']))"
```

---

## What Phase 2 Adds

Phase 1 has **no authentication** — anyone on the same network can call these
endpoints. Phase 2 adds:

1. **SQLite database** — stores paired device records and persists the audit log.
2. **JWT pairing flow** — a one-time `/pair` endpoint issues a refresh token.
3. **JWT middleware** — all command endpoints require a valid access token.
4. **QR code generation** — the agent prints its pairing info as a QR code the
   phone can scan to bootstrap the auth flow.
