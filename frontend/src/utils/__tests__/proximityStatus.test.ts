import type { ProximityState } from '../../types/api';
import { proximityStatusLine } from '../proximityStatus';

function state(overrides: Partial<ProximityState> = {}): ProximityState {
  return {
    enabled: true,
    target_mac: '58:79:E0:A6:C7:85',
    target_name: 'My Phone',
    poll_interval_secs: 20,
    miss_threshold: 3,
    present: true,
    armed: true,
    consecutive_misses: 0,
    last_probe_at: '2026-08-30T09:00:00+00:00',
    last_detail: '7 services',
    last_lock_at: null,
    last_error: null,
    running: true,
    ...overrides,
  };
}

describe('proximityStatusLine', () => {
  it('reports loading before the first response', () => {
    expect(proximityStatusLine(undefined)).toBe('Loading…');
  });

  it('reports off when disabled', () => {
    expect(proximityStatusLine(state({ enabled: false }))).toBe('Off');
  });

  it('waits for the first probe rather than claiming absence', () => {
    expect(proximityStatusLine(state({ present: null }))).toBe('Waiting for the first check…');
  });

  it('reports the phone as nearby when present', () => {
    expect(proximityStatusLine(state())).toBe('Phone detected nearby');
  });

  it('counts down while armed', () => {
    const line = proximityStatusLine(state({ present: false, armed: true, consecutive_misses: 2 }));
    expect(line).toBe('Phone not detected (2 of 3)');
  });

  it('does not show a count past the threshold once it has fired', () => {
    // The regression: consecutive_misses keeps climbing while the phone is
    // away, but the tracker disarmed at 3 — so "4 of 3" is counting toward a
    // threshold that already fired.
    const line = proximityStatusLine(state({ present: false, armed: false, consecutive_misses: 7 }));
    expect(line).toBe('Phone away — laptop locked');
    expect(line).not.toMatch(/of 3/);
  });

  it('resumes counting down after the phone returns and leaves again', () => {
    const line = proximityStatusLine(state({ present: false, armed: true, consecutive_misses: 1 }));
    expect(line).toBe('Phone not detected (1 of 3)');
  });

  it('surfaces a probe error instead of implying the phone is away', () => {
    const line = proximityStatusLine(state({ present: false, last_error: 'radio off' }));
    expect(line).toBe("Can't check right now — radio off");
  });
});
