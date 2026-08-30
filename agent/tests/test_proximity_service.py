"""
Tests for the proximity auto-lock service loop.

Never touches a real Bluetooth radio or locks the machine — the probe and the
OS calls are both mocked. `_tick` is driven directly rather than running
`_run` with real sleeps, so these stay fast and deterministic.
"""
import asyncio
import os
import tempfile

os.environ.setdefault("TETHER_JWT_SECRET", "testsecret")
test_db_fd, test_db_path = tempfile.mkstemp(suffix=".db")
os.environ.setdefault("TETHER_DB_PATH", test_db_path)

from unittest import mock

import pytest

from agent.core import db, proximity


@pytest.fixture(autouse=True)
def clean_settings():
    db.init_db()
    with db._conn() as con:
        con.execute("DELETE FROM agent_settings")
    yield


def _settings(**overrides) -> proximity.ProximitySettings:
    base = {
        "enabled": True,
        "target_mac": "58:79:E0:A6:C7:85",
        "target_name": "Test Phone",
        "poll_interval_secs": 20,
        "miss_threshold": 3,
    }
    base.update(overrides)
    return proximity.ProximitySettings(**base)


def _run(coro):
    """Drive one coroutine to completion (no pytest-asyncio in this repo)."""
    return asyncio.run(coro)


def _probe_ok(present: bool) -> dict:
    return {"ok": True, "result": {"present": present, "detail": "x", "elapsed_secs": 1.0}}


async def _drive(service, settings, results):
    """Feed a scripted sequence of probe results through _tick."""
    with mock.patch.object(proximity.bluetooth, "probe_presence", side_effect=results) as probe:
        for _ in results:
            await service._tick(settings)
    return probe


def test_locks_after_threshold_consecutive_absences():
    service = proximity.ProximityService()
    settings = _settings(miss_threshold=3)
    with mock.patch.object(proximity.win, "lock_workstation", return_value={"ok": True}) as lock, \
         mock.patch.object(proximity.win, "_is_locked", return_value=False):
        _run(_drive(service, settings, [_probe_ok(False)] * 3))
    assert lock.call_count == 1


def test_does_not_lock_while_phone_is_present():
    service = proximity.ProximityService()
    settings = _settings(miss_threshold=2)
    with mock.patch.object(proximity.win, "lock_workstation") as lock, \
         mock.patch.object(proximity.win, "_is_locked", return_value=False):
        _run(_drive(service, settings, [_probe_ok(True)] * 5))
    lock.assert_not_called()


def test_locks_only_once_while_phone_stays_away():
    """A phone left in another room must not re-lock the machine every tick."""
    service = proximity.ProximityService()
    settings = _settings(miss_threshold=2)
    with mock.patch.object(proximity.win, "lock_workstation", return_value={"ok": True}) as lock, \
         mock.patch.object(proximity.win, "_is_locked", return_value=False):
        _run(_drive(service, settings, [_probe_ok(False)] * 6))
    assert lock.call_count == 1


def test_probe_error_does_not_count_as_absence():
    """
    A Bluetooth stack error means "couldn't tell", not "you left". Locking on
    it would mean a flaky radio locks the machine while you're sitting there.
    """
    service = proximity.ProximityService()
    settings = _settings(miss_threshold=2)
    failures = [{"ok": False, "error": "radio off"}] * 5
    with mock.patch.object(proximity.win, "lock_workstation") as lock, \
         mock.patch.object(proximity.win, "_is_locked", return_value=False):
        _run(_drive(service, settings, failures))
    lock.assert_not_called()
    assert service.snapshot()["last_error"] == "radio off"


def test_skips_lock_when_already_locked_but_still_consumes_the_trigger():
    service = proximity.ProximityService()
    settings = _settings(miss_threshold=2)
    with mock.patch.object(proximity.win, "lock_workstation") as lock, \
         mock.patch.object(proximity.win, "_is_locked", return_value=True):
        _run(_drive(service, settings, [_probe_ok(False)] * 4))
    lock.assert_not_called()
    # Tracker disarmed itself, so no lock is left pending for when you return.
    assert service._tracker.armed is False


def test_returning_re_arms_and_a_second_departure_locks_again():
    service = proximity.ProximityService()
    settings = _settings(miss_threshold=2)
    sequence = [
        _probe_ok(False), _probe_ok(False),   # away -> lock #1
        _probe_ok(True),                      # back -> re-armed
        _probe_ok(False), _probe_ok(False),   # away -> lock #2
    ]
    with mock.patch.object(proximity.win, "lock_workstation", return_value={"ok": True}) as lock, \
         mock.patch.object(proximity.win, "_is_locked", return_value=False):
        _run(_drive(service, settings, sequence))
    assert lock.call_count == 2


def test_resync_after_a_long_gap_skips_the_tick():
    """
    Waking from sleep, arbitrary wall-clock time has passed with no probes.
    The accumulated streak is meaningless and must not fire a lock.
    """
    service = proximity.ProximityService()
    settings = _settings(miss_threshold=2)
    service._tracker = proximity.ProximityTracker(2)
    service._tracker.record_sighting(False)
    service._last_tick_monotonic = 0.0  # far in the past -> looks like a resume

    with mock.patch.object(proximity.win, "lock_workstation") as lock, \
         mock.patch.object(proximity.bluetooth, "probe_presence") as probe:
        _run(service._tick(settings))

    lock.assert_not_called()
    probe.assert_not_called()          # resync happens before probing
    assert service._tracker.consecutive_misses == 0


def test_changing_miss_threshold_rebuilds_the_tracker():
    service = proximity.ProximityService()
    with mock.patch.object(proximity.win, "lock_workstation", return_value={"ok": True}), \
         mock.patch.object(proximity.win, "_is_locked", return_value=False):
        _run(_drive(service, _settings(miss_threshold=5), [_probe_ok(False)]))
        assert service._tracker.miss_threshold == 5
        _run(_drive(service, _settings(miss_threshold=2), [_probe_ok(False)]))
        assert service._tracker.miss_threshold == 2


def test_settings_round_trip_and_clamping():
    proximity.save_settings(enabled=True, target_mac="58:79:E0:A6:C7:85", poll_interval_secs=9999)
    s = proximity.get_settings()
    assert s.enabled is True
    assert s.target_mac == "58:79:E0:A6:C7:85"
    # Clamped to the configured maximum, so a bad phone-side value can't turn
    # the loop into a hair-trigger or an hours-long wait.
    assert s.poll_interval_secs == 300


def test_start_stop_is_clean():

    async def go():
        service = proximity.ProximityService()
        await service.start()
        assert service.snapshot()["running"] is True
        await service.stop()
        assert service._task is None

    asyncio.run(go())
