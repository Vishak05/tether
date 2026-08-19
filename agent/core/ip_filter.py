"""
Tether Agent — Tailscale IP Filtering Middleware

Phase 3: requests are now expected to arrive over the Tailscale mesh rather
than the open internet or even plain LAN. This middleware rejects any request
whose source IP isn't inside the configured Tailscale CIDR (or localhost),
as defense-in-depth beyond JWT auth — a stolen/leaked token is far less useful
if the attacker also needs a foothold on the tailnet.

CORS (see main.py) is a browser-enforced mechanism and largely irrelevant to
a native mobile client, which is why this IP check — not CORS — is the real
network boundary for Phase 3.
"""
import ipaddress

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from agent.core.config import ALLOW_LOCALHOST, IP_FILTER_ENABLED, TAILSCALE_CIDR
from agent.core.logging import get_logger

log = get_logger("tether.ip_filter")

_LOCALHOST_IPS = {"127.0.0.1", "::1"}


def _is_allowed(ip: str, network: ipaddress._BaseNetwork, allow_localhost: bool) -> bool:
    """Pure check, kept separate from the middleware for easy unit testing."""
    if allow_localhost and ip in _LOCALHOST_IPS:
        return True
    try:
        return ipaddress.ip_address(ip) in network
    except ValueError:
        return False


class TailscaleIPMiddleware(BaseHTTPMiddleware):
    """Rejects any request whose source IP isn't on the Tailscale network."""

    def __init__(self, app, cidr: str = TAILSCALE_CIDR, allow_localhost: bool = ALLOW_LOCALHOST,
                 enabled: bool = IP_FILTER_ENABLED):
        super().__init__(app)
        self._network = ipaddress.ip_network(cidr)
        self._allow_localhost = allow_localhost
        self._enabled = enabled

    async def dispatch(self, request: Request, call_next):
        if not self._enabled:
            return await call_next(request)

        client_ip = request.client.host if request.client else None
        if client_ip is None or not _is_allowed(client_ip, self._network, self._allow_localhost):
            log.warning(
                "rejected request: source IP not on Tailscale network",
                extra={"source_ip": client_ip, "path": request.url.path},
            )
            return JSONResponse(
                status_code=403,
                content={"detail": "Forbidden: source IP not on Tailscale network"},
            )

        return await call_next(request)
