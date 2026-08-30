"""
Tether Agent — FastAPI Application Entry Point

Assembles the app: CORS, routers, startup/shutdown lifecycle hooks,
and the root health-check endpoint.

Phase 1: No auth, same-wifi only.
Phase 2: JWT middleware, pairing flow, device management, SQLite audit log.
Phase 3: Tailscale IP filtering.
Phase 4: WebSocket real-time status (WS /ws/status).
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent.core import db, proximity
from agent.core.config import LAPTOP_ID, PLATFORM
from agent.core.ip_filter import TailscaleIPMiddleware
from agent.core.logging import get_logger
from agent.routes.auth import router as auth_router
from agent.routes.commands import router as commands_router
from agent.routes.devices import router as devices_router
from agent.routes.files import router as files_router
from agent.routes.pair import router as pair_router
from agent.routes.proximity import router as proximity_router
from agent.routes.status import router as status_router
from agent.routes.ws_status import router as ws_status_router

log = get_logger("tether.app")


# ── lifespan (startup / shutdown hooks) ───────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise SQLite schema (no-op if tables already exist)
    db.init_db()
    log.info("Tether agent starting", extra={"laptop_id": LAPTOP_ID, "platform": PLATFORM})

    # Proximity auto-lock polls for the paired phone over Bluetooth and locks
    # the workstation when it's been out of range long enough. It starts
    # regardless of whether the feature is enabled — the loop reads its own
    # settings each tick and idles when off, so toggling it from the phone
    # doesn't require restarting the agent (which runs as a scheduled task the
    # user can't restart from the app).
    await proximity.SERVICE.start()

    try:
        yield
    finally:
        # try/finally so shutdown still runs if the app errors out — a
        # bare post-yield block would be skipped.
        await proximity.SERVICE.stop()
        log.info("Tether agent shutting down")


# ── app factory ────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="Tether Agent",
        description=(
            "Laptop-side agent for the Tether remote control app. "
            "Exposes command and status endpoints consumed by the mobile client."
        ),
        version="0.4.0-phase4",
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
    app.include_router(ws_status_router)  # WS   /ws/status
    app.include_router(files_router)      # GET/POST /files/*
    app.include_router(proximity_router)  # GET/PATCH /proximity, GET /proximity/bonded

    # ── root ────────────────────────────────────────────────────────────────────
    @app.get("/", tags=["health"], summary="Root health check")
    async def root():
        return {
            "service":   "tether-agent",
            "laptop_id": LAPTOP_ID,
            "platform":  PLATFORM,
            "version":   "0.4.0-phase4",
            "status":    "ok",
        }

    return app


app = create_app()
