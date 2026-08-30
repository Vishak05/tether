"""
Tests for the proximity auto-lock state machine.

A case-for-case port of frontend/src/utils/__tests__/proximityTracker.test.ts.
The logic moved from the phone to the agent so auto-lock works with the app
closed; keeping the same tests means the behaviour that was already proven
carries over rather than being re-derived.
"""
import pytest

from agent.core.proximity import ProximityTracker


def test_does_not_lock_while_phone_keeps_being_seen():
    t = ProximityTracker(3)
    assert t.record_sighting(True) is False
    assert t.record_sighting(True) is False
    assert t.record_sighting(True) is False


def test_locks_after_miss_threshold_consecutive_misses():
    t = ProximityTracker(3)
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is True


def test_does_not_lock_again_until_re_armed_by_a_sighting():
    t = ProximityTracker(2)
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is True
    # still absent — must not fire again, or a phone left in another room
    # would re-lock the machine on every tick
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is False


def test_re_arms_on_sighting_and_can_lock_a_second_time():
    t = ProximityTracker(2)
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is True   # first lock
    assert t.record_sighting(True) is False   # phone back — re-armed
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is True   # second lock


def test_sighting_mid_streak_resets_the_miss_counter():
    t = ProximityTracker(3)
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is False
    assert t.record_sighting(True) is False   # resets
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is True   # 3rd consecutive miss since reset


def test_rejects_a_non_positive_miss_threshold():
    with pytest.raises(ValueError):
        ProximityTracker(0)


# ── additions beyond the ported suite ─────────────────────────────────────────

def test_reset_re_arms_and_zeroes_misses():
    t = ProximityTracker(3)
    t.record_sighting(False)
    t.record_sighting(False)
    assert t.consecutive_misses == 2
    t.reset()
    assert t.consecutive_misses == 0
    assert t.armed is True
    # the streak is genuinely gone — a full threshold is needed again
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is False
    assert t.record_sighting(False) is True


def test_threshold_of_one_locks_on_first_miss():
    t = ProximityTracker(1)
    assert t.record_sighting(False) is True
    assert t.record_sighting(False) is False   # disarmed
    assert t.record_sighting(True) is False    # re-armed
    assert t.record_sighting(False) is True
