import { ProximityTracker } from '../proximityTracker';

describe('ProximityTracker', () => {
  it('does not lock while the anchor keeps being seen', () => {
    const t = new ProximityTracker(3);
    expect(t.recordSighting(true)).toBe(false);
    expect(t.recordSighting(true)).toBe(false);
    expect(t.recordSighting(true)).toBe(false);
  });

  it('locks after missThreshold consecutive misses', () => {
    const t = new ProximityTracker(3);
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(false)).toBe(true);
  });

  it('does not lock again on further misses until re-armed by a sighting', () => {
    const t = new ProximityTracker(2);
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(false)).toBe(true);
    // still absent — must not fire again
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(false)).toBe(false);
  });

  it('re-arms once the anchor is seen again, and can lock a second time after that', () => {
    const t = new ProximityTracker(2);
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(false)).toBe(true); // first lock
    expect(t.recordSighting(true)).toBe(false); // anchor back — re-armed
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(false)).toBe(true); // second lock
  });

  it('a sighting mid-streak resets the miss counter', () => {
    const t = new ProximityTracker(3);
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(true)).toBe(false); // resets
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(false)).toBe(false);
    expect(t.recordSighting(false)).toBe(true); // 3rd consecutive miss since reset
  });

  it('rejects a non-positive missThreshold', () => {
    expect(() => new ProximityTracker(0)).toThrow();
  });
});
