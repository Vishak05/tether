"""
Tether Agent — FastAPI Application Entry Point

Assembles the app: CORS, routers, startup/shutdown lifecycle hooks,
and the root health-check endpoint.

Phase 1: No auth, same-wifi only.
Phase 2: JWT middleware, pairing flow, device management, SQLite audit log.
Phase 3: Tailscale IP filtering.
Phase 4 will mount the WebSocket router here.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent.core import db
from agent.core.config import LAPTOP_ID, PLATFORM
from agent.core.ip_filter import TailscaleIPMiddleware
from agent.core.logging import get_logger
from agent.routes.auth import router as auth_router
from agent.routes.commands import router as commands_router
from agent.routes.devices import router as devices_router
from agent.routes.pair import router as pair_router
from agent.routes.status import router as status_router

log = get_logger("tether.app")


# ── lifespan (startup / shutdown hooks) ───────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise SQLite schema (no-op if tables already exist)
    db.init_db()
    log.info("Tether agent starting", extra={"laptop_id": LAPTOP_ID, "platform": PLATFORM})
    yield
    log.info("Tether agent shutting down")


# ── app factory ────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="Tether Agent",
        description=(
            "Laptop-side agent for the Tether remote control app. "
            "Exposes command and status endpoints consumed by the mobile client."
        ),
        version="0.3.0-phase3",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ────────────────────────────────────────────────────────────────────
    # CORS is a browser-enforced mechanism — the mobile client is a native app,
    # not a browser, so it never sends the Origin headers CORS cares about.
    # Left permissive on purpose; the real Phase 3 network boundary is the
    # Tailscale IP filter below, not CORS.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # ── Tailscale IP filter ─────────────────────────────────────────────────────
    # Added after CORS, which means it runs BEFORE CORS in Starlette's
    # outer-to-inner middleware stack (last-added middleware wraps outermost).
    # Rejects any request whose source IP isn't on the tailnet (or localhost).
    app.add_middleware(TailscaleIPMiddleware)

    # ── routers ─────────────────────────────────────────────────────────────────
    app.include_router(pair_router)       # GET  /pair
    app.include_router(auth_router)       # POST /auth/pair, /auth/refresh, /auth/revoke
    app.include_router(devices_router)    # GET  /devices, DELETE /devices/{id}
    app.include_router(commands_router)   # POST /commands/*
    app.include_router(status_router)     # GET  /status

    # ── root ────────────────────────────────────────────────────────────────────
    @app.get("/", tags=["health"], summary="Root health check")
    async def root():
        return {
            "service":   "tether-agent",
            "laptop_id": LAPTOP_ID,
            "platform":  PLATFORM,
            "version":   "0.3.0-phase3",
            "status":    "ok",
        }

    return app


app = create_app()
