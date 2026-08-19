"""
Tether Agent — Network IP Filtering Middleware

Phase 3: requests are expected to arrive over the Tailscale mesh (for remote
access) or the local WiFi/LAN (same-network fallback, per the original plan)
— not the open internet. This middleware rejects any request whose source IP
isn't inside one of those ranges (or localhost), as defense-in-depth beyond
JWT auth — a stolen/leaked token is far less useful if the attacker also
needs a foothold on the tailnet or the same private network.

CORS (see main.py) is a browser-enforced mechanism and largely irrelevant to
a native mobile client, which is why this IP check — not CORS — is the real
network boundary for Phase 3.
"""
import ipaddress

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from agent.core.config import (
    ALLOW_LOCALHOST,
    ALLOW_PRIVATE_LAN,
    IP_FILTER_ENABLED,
    PRIVATE_LAN_CIDRS,
    TAILSCALE_CIDR,
)
from agent.core.logging import get_logger

log = get_logger("tether.ip_filter")

_LOCALHOST_IPS = {"127.0.0.1", "::1"}


def _build_networks(cidr: str, allow_private_lan: bool) -> list[ipaddress._BaseNetwork]:
    networks = [ipaddress.ip_network(cidr)]
    if allow_private_lan:
        networks.extend(ipaddress.ip_network(c) for c in PRIVATE_LAN_CIDRS)
    return networks


def _is_allowed(ip: str, networks: list[ipaddress._BaseNetwork], allow_localhost: bool) -> bool:
    """Pure check, kept separate from the middleware for easy unit testing."""
    if allow_localhost and ip in _LOCALHOST_IPS:
        return True
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in network for network in networks)


class TailscaleIPMiddleware(BaseHTTPMiddleware):
    """Rejects any request whose source IP isn't on the tailnet or private LAN."""

    def __init__(self, app, cidr: str = TAILSCALE_CIDR, allow_localhost: bool = ALLOW_LOCALHOST,
                 allow_private_lan: bool = ALLOW_PRIVATE_LAN, enabled: bool = IP_FILTER_ENABLED):
        super().__init__(app)
        self._networks = _build_networks(cidr, allow_private_lan)
        self._allow_localhost = allow_localhost
        self._enabled = enabled

    async def dispatch(self, request: Request, call_next):
        if not self._enabled:
            return await call_next(request)

        client_ip = request.client.host if request.client else None
        if client_ip is None or not _is_allowed(client_ip, self._networks, self._allow_localhost):
            log.warning(
                "rejected request: source IP not on Tailscale network or private LAN",
                extra={"source_ip": client_ip, "path": request.url.path},
            )
            return JSONResponse(
                status_code=403,
                content={"detail": "Forbidden: source IP not on Tailscale network or private LAN"},
            )

        return await call_next(request)


# Starlette's BaseHTTPMiddleware only wraps HTTP-scope requests — it does not
# run for WebSocket connections. Routes that need the same check (e.g.
# WS /ws/status) call this directly instead of relying on the middleware.
_default_networks = _build_networks(TAILSCALE_CIDR, ALLOW_PRIVATE_LAN)


def is_source_allowed(ip: str | None) -> bool:
    if not IP_FILTER_ENABLED:
        return True
    if ip is None:
        return False
    return _is_allowed(ip, _default_networks, ALLOW_LOCALHOST)
