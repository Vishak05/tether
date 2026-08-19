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

# Escape hatch to disable IP filtering entirely (e.g. local dev on plain wifi).
IP_FILTER_ENABLED: bool = os.getenv("TETHER_IP_FILTER_ENABLED", "true").lower() == "true"
