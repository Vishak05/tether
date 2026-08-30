import type { ProximityState } from '../types/api';

/**
 * The one-line human summary of what auto-lock is currently doing.
 *
 * Pure so it can be tested directly — the counter here is easy to get wrong.
 * `consecutive_misses` keeps incrementing for as long as the phone is away,
 * but the tracker fires at `miss_threshold` and then disarms, so past that
 * point the count is no longer a countdown toward anything: rendering it as
 * "N of M" produces "4 of 3", then "5 of 3", forever.
 *
 * `armed` is what separates the two situations. While armed, the count is a
 * genuine countdown and can't exceed the threshold (reaching it is what fires
 * the lock). Once disarmed, the lock has already happened and the only useful
 * thing to say is that it did; a sighting re-arms and the countdown resumes.
 */
export function proximityStatusLine(state: ProximityState | undefined): string {
  if (!state) return 'Loading…';
  if (!state.enabled) return 'Off';
  if (state.last_error) return `Can't check right now — ${state.last_error}`;
  if (state.present === null) return 'Waiting for the first check…';
  if (state.present) return 'Phone detected nearby';
  if (!state.armed) return 'Phone away — laptop locked';
  return `Phone not detected (${state.consecutive_misses} of ${state.miss_threshold})`;
}
