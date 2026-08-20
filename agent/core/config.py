"""
Tether Agent — Core Configuration
Centralised settings and constants for the laptop agent.
"""
import os
import secrets
import socket
from pathlib import Path

# ──────────────────────────────────────────────
# Server
# ──────────────────────────────────────────────
HOST: str = os.getenv("TETHER_HOST", "0.0.0.0")
PORT: int = int(os.getenv("TETHER_PORT", "8765"))

# ──────────────────────────────────────────────
# Laptop identity
# ──────────────────────────────────────────────
LAPTOP_ID: str = os.getenv("TETHER_LAPTOP_ID", socket.gethostname())

# ──────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────
LOG_LEVEL: str = os.getenv("TETHER_LOG_LEVEL", "INFO")

# ──────────────────────────────────────────────
# OS detection (used by os_layer dispatcher)
# ──────────────────────────────────────────────
import platform
PLATFORM: str = platform.system()   # "Windows", "Linux", "Darwin"

# ──────────────────────────────────────────────
# Phase 2 — auth & persistence
# ──────────────────────────────────────────────

# Data directory: ~/.tether/
_TETHER_DIR = Path.home() / ".tether"
_TETHER_DIR.mkdir(parents=True, exist_ok=True)

# Where get_logger() writes agent.log — same directory as the DB/secret file.
# Needs to exist even when running headless via pythonw.exe (no console to
# fall back to), which is exactly the scenario this is for.
LOG_DIR: Path = _TETHER_DIR

# SQLite database path
DB_PATH: Path = Path(os.getenv("TETHER_DB_PATH", str(_TETHER_DIR / "tether.db")))

# JWT signing secret — load from env or auto-generate + persist
_SECRET_FILE = _TETHER_DIR / "secret.key"

def _load_or_create_secret() -> str:
    env_val = os.getenv("TETHER_JWT_SECRET")
    if env_val:
        return env_val
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_text().strip()
    new_secret = secrets.token_hex(32)
    _SECRET_FILE.write_text(new_secret)
    _SECRET_FILE.chmod(0o600)   # owner-read-only
    return new_secret

JWT_SECRET: str = _load_or_create_secret()
JWT_ALGORITHM: str = "HS256"

# Token TTLs (seconds)
ACCESS_TOKEN_TTL:  int = int(os.getenv("TETHER_ACCESS_TTL",  "900"))   # 15 min
REFRESH_TOKEN_TTL: int = int(os.getenv("TETHER_REFRESH_TTL", "2592000"))  # 30 days
PAIRING_TOKEN_TTL: int = int(os.getenv("TETHER_PAIR_TTL",    "300"))    # 5 min

# ──────────────────────────────────────────────
# Phase 3 — Tailscale IP filtering
# ──────────────────────────────────────────────

# Tailscale's default tailnet range (CGNAT block, 100.64.0.0/10). Override if
# your tailnet uses a custom range or you want to restrict to a single device IP.
TAILSCALE_CIDR: str = os.getenv("TETHER_TAILSCALE_CIDR", "100.64.0.0/10")

# Always allow loopback requests (localhost curl, Swagger UI, TestClient).
ALLOW_LOCALHOST: bool = os.getenv("TETHER_ALLOW_LOCALHOST", "true").lower() == "true"

# Also allow plain private-LAN traffic (same WiFi/router), not just Tailscale.
# Matches the original plan's "fallback to local IP when on same wifi" —
# reaching the agent from the same network you're already trusted on is not
# the same risk as the open internet, which is what this filter exists to
# block. Covers the standard RFC1918 ranges.
ALLOW_PRIVATE_LAN: bool = os.getenv("TETHER_ALLOW_PRIVATE_LAN", "true").lower() == "true"
PRIVATE_LAN_CIDRS: list[str] = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]

# Escape hatch to disable IP filtering entirely (e.g. local dev on plain wifi).
IP_FILTER_ENABLED: bool = os.getenv("TETHER_IP_FILTER_ENABLED", "true").lower() == "true"

# ──────────────────────────────────────────────
# Phase 4 — WebSocket real-time status
# ──────────────────────────────────────────────

# How often (seconds) the /ws/status heartbeat pushes a fresh status snapshot.
HEARTBEAT_INTERVAL_SECS: int = int(os.getenv("TETHER_HEARTBEAT_INTERVAL", "7"))

# How many heartbeat ticks between re-checking the device's trust status, so a
# mid-session revocation (DELETE /devices/{id}) closes the socket promptly
# instead of only being enforced at the initial handshake.
TRUST_RECHECK_EVERY_N_TICKS: int = int(os.getenv("TETHER_TRUST_RECHECK_TICKS", "4"))

# ──────────────────────────────────────────────
# File quick-send (watched-folder convention)
# ──────────────────────────────────────────────

# Drop files here for the phone to list/download.
OUTBOX_DIR: Path = Path(os.getenv("TETHER_OUTBOX_DIR", str(Path.home() / "Tether Outbox")))
OUTBOX_DIR.mkdir(parents=True, exist_ok=True)

# Files uploaded from the phone land here.
INBOX_DIR: Path = Path(os.getenv("TETHER_INBOX_DIR", str(Path.home() / "Tether Inbox")))
INBOX_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_MB: int = int(os.getenv("TETHER_MAX_UPLOAD_MB", "100"))

# ──────────────────────────────────────────────
# Live clipboard sync
# ──────────────────────────────────────────────

# How often (seconds) each open /ws/clipboard connection polls the Windows
# clipboard for changes to push to the phone.
CLIPBOARD_POLL_INTERVAL_SECS: float = float(os.getenv("TETHER_CLIPBOARD_POLL_INTERVAL", "1.5"))
