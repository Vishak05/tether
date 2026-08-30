"""
Tether Agent — Proximity Auto-Lock State Machine

Decides when the laptop should lock itself based on a stream of "was the
phone seen this tick?" booleans. Deliberately knows nothing about Bluetooth,
so it can be unit-tested without hardware, a mock radio, or async timing.

This is a direct port of frontend/src/utils/proximityTracker.ts, which is
being retired along with the rest of the phone-side auto-lock. Detection is
moving to the agent so it works with the phone app closed — the app-side
version could only run while it was open in the foreground. The semantics are
kept identical so the behaviour that was already proven by the TypeScript
tests carries over unchanged; agent/tests/test_proximity_tracker.py is a port
of that same suite, case for case.
"""
import asyncio
import time
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timezone

from agent.core import config, db
from agent.core.logging import get_logger
from agent.os_layer import bluetooth
from agent.os_layer import windows as win

log = get_logger("tether.proximity")


class ProximityTracker:
    """
    Turns sighting ticks into lock decisions.

    - Any sighting resets the miss counter and re-arms.
    - `miss_threshold` consecutive misses while armed fires once, then
      disarms — so a phone that stays away doesn't re-fire a lock on every
      tick. It has to be seen again before it can fire a second time.
    """

    def __init__(self, miss_threshold: int) -> None:
        if miss_threshold < 1:
            raise ValueError("miss_threshold must be at least 1")
        self._miss_threshold = miss_threshold
        self._consecutive_misses = 0
        self._armed = True

    def record_sighting(self, seen: bool) -> bool:
        """Feed one tick's result. Returns True iff this tick should lock."""
        if seen:
            self._consecutive_misses = 0
            self._armed = True
            return False

        self._consecutive_misses += 1
        if self._armed and self._consecutive_misses >= self._miss_threshold:
            self._armed = False
            return True
        return False

    def reset(self) -> None:
        """
        Return to the initial state: armed, no misses recorded.

        Used when something makes the accumulated streak meaningless — the
        target device is changed from the app, or the machine wakes from
        sleep having missed an arbitrary number of ticks.
        """
        self._consecutive_misses = 0
        self._armed = True

    @property
    def miss_threshold(self) -> int:
        return self._miss_threshold

    @property
    def consecutive_misses(self) -> int:
        return self._consecutive_misses

    @property
    def armed(self) -> bool:
        return self._armed


# ── settings ──────────────────────────────────────────────────────────────────

_KEY_ENABLED = "prox.enabled"
_KEY_TARGET_MAC = "prox.target_mac"
_KEY_TARGET_NAME = "prox.target_name"
_KEY_POLL_INTERVAL = "prox.poll_interval_secs"
_KEY_MISS_THRESHOLD = "prox.miss_threshold"


@dataclass(frozen=True)
class ProximitySettings:
    enabled: bool
    target_mac: str | None
    target_name: str | None
    poll_interval_secs: int
    miss_threshold: int


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def get_settings() -> ProximitySettings:
    """
    Current settings: DB values where present, config defaults otherwise.

    Re-read every tick so a change from the phone applies without restarting
    the agent — which matters because it runs as a scheduled task, where a
    restart isn't something the user can trigger from the app.
    """
    raw_enabled = db.get_setting(_KEY_ENABLED)
    enabled = (raw_enabled == "true") if raw_enabled is not None else config.PROXIMITY_ENABLED_DEFAULT

    mac = db.get_setting(_KEY_TARGET_MAC, config.PROXIMITY_TARGET_MAC_DEFAULT) or None
    name = db.get_setting(_KEY_TARGET_NAME) or None

    try:
        poll = int(db.get_setting(_KEY_POLL_INTERVAL, str(config.PROXIMITY_POLL_INTERVAL_SECS)))
    except (TypeError, ValueError):
        poll = config.PROXIMITY_POLL_INTERVAL_SECS
    try:
        misses = int(db.get_setting(_KEY_MISS_THRESHOLD, str(config.PROXIMITY_MISS_THRESHOLD)))
    except (TypeError, ValueError):
        misses = config.PROXIMITY_MISS_THRESHOLD

    return ProximitySettings(
        enabled=enabled,
        target_mac=mac,
        target_name=name,
        poll_interval_secs=_clamp(
            poll, config.PROXIMITY_MIN_POLL_INTERVAL_SECS, config.PROXIMITY_MAX_POLL_INTERVAL_SECS
        ),
        miss_threshold=_clamp(
            misses, config.PROXIMITY_MIN_MISS_THRESHOLD, config.PROXIMITY_MAX_MISS_THRESHOLD
        ),
    )


def save_settings(
    *,
    enabled: bool | None = None,
    target_mac: str | None = None,
    target_name: str | None = None,
    poll_interval_secs: int | None = None,
    miss_threshold: int | None = None,
) -> ProximitySettings:
    """Partial update; only the fields passed are written."""
    if enabled is not None:
        db.set_setting(_KEY_ENABLED, "true" if enabled else "false")
    if target_mac is not None:
        db.set_setting(_KEY_TARGET_MAC, target_mac)
    if target_name is not None:
        db.set_setting(_KEY_TARGET_NAME, target_name)
    if poll_interval_secs is not None:
        db.set_setting(_KEY_POLL_INTERVAL, str(poll_interval_secs))
    if miss_threshold is not None:
        db.set_setting(_KEY_MISS_THRESHOLD, str(miss_threshold))
    return get_settings()


# ── the service ───────────────────────────────────────────────────────────────

class ProximityService:
    """
    Polls for the phone and locks the workstation when it's been gone long
    enough. Runs for the lifetime of the agent process, started from the
    FastAPI lifespan hook.
    """

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._tracker: ProximityTracker | None = None
        self._present: bool | None = None
        self._last_probe_at: str | None = None
        self._last_detail: str | None = None
        self._last_lock_at: str | None = None
        self._last_error: str | None = None
        self._last_tick_monotonic: float | None = None

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    def on_settings_changed(self) -> None:
        """
        Drop accumulated state after a settings change.

        Without this, switching to a different phone would inherit the old
        one's miss streak and could lock immediately.
        """
        self._tracker = None
        self._present = None
        self._last_error = None

    def snapshot(self) -> dict:
        settings = get_settings()
        return {
            "enabled": settings.enabled,
            "target_mac": settings.target_mac,
            "target_name": settings.target_name,
            "poll_interval_secs": settings.poll_interval_secs,
            "miss_threshold": settings.miss_threshold,
            "present": self._present,
            "armed": self._tracker.armed if self._tracker else True,
            "consecutive_misses": self._tracker.consecutive_misses if self._tracker else 0,
            "last_probe_at": self._last_probe_at,
            "last_detail": self._last_detail,
            "last_lock_at": self._last_lock_at,
            "last_error": self._last_error,
            "running": self._task is not None and not self._task.done(),
        }

    async def _run(self) -> None:
        log.info("proximity service started")
        try:
            while True:
                settings = get_settings()
                try:
                    if settings.enabled and settings.target_mac:
                        await self._tick(settings)
                    else:
                        # Idle: forget any streak so re-enabling starts clean.
                        self._tracker = None
                        self._present = None
                except asyncio.CancelledError:
                    raise
                except Exception:
                    # Never let one bad tick kill the loop — it's the only
                    # thing standing between an unattended laptop and staying
                    # unlocked, and nobody is watching a console to restart it.
                    log.exception("proximity tick failed")
                await asyncio.sleep(settings.poll_interval_secs)
        except asyncio.CancelledError:
            log.info("proximity service stopped")
            raise

    async def _tick(self, settings: ProximitySettings) -> None:
        # Rebuild the tracker if the threshold changed or we're starting fresh.
        if self._tracker is None or self._tracker.miss_threshold != settings.miss_threshold:
            self._tracker = ProximityTracker(settings.miss_threshold)

        # Waking from sleep/hibernate: an arbitrary amount of wall-clock time
        # passed without probes, so the streak means nothing. Resync rather
        # than letting a stale count fire a lock the moment the lid opens.
        now_monotonic = time.monotonic()
        if self._last_tick_monotonic is not None:
            gap = now_monotonic - self._last_tick_monotonic
            if gap > settings.poll_interval_secs * 3:
                log.info("proximity resync after gap", extra={"gap_secs": round(gap, 1)})
                self._tracker.reset()
                self._last_tick_monotonic = now_monotonic
                return
        self._last_tick_monotonic = now_monotonic

        outcome = await bluetooth.probe_presence(settings.target_mac, config.PROXIMITY_PROBE_TIMEOUT_SECS)
        self._last_probe_at = datetime.now(timezone.utc).isoformat()

        if not outcome["ok"]:
            # Couldn't tell. Explicitly NOT counted as a miss: a Bluetooth
            # stack error or a disabled radio must never lock the machine.
            self._last_error = outcome["error"]
            self._last_detail = None
            log.warning("proximity probe failed", extra={"error": outcome["error"]})
            return

        self._last_error = None
        present = bool(outcome["result"]["present"])
        self._present = present
        self._last_detail = outcome["result"]["detail"]

        should_lock = self._tracker.record_sighting(present)
        log.info(
            "proximity probe",
            extra={
                "present": present,
                "detail": self._last_detail,
                "elapsed_secs": outcome["result"]["elapsed_secs"],
                "consecutive_misses": self._tracker.consecutive_misses,
                "will_lock": should_lock,
            },
        )

        if not should_lock:
            return

        # The tracker has already disarmed itself, so skipping the lock here
        # doesn't leave a pending one to fire when you sit back down.
        if win._is_locked():
            log.info("proximity: phone away but workstation already locked")
            return

        result = win.lock_workstation()
        self._last_lock_at = datetime.now(timezone.utc).isoformat()
        log.info("proximity lock triggered", extra={"ok": result.get("ok"), "target": settings.target_mac})


SERVICE = ProximityService()
