/**
 * Pure "seen/not-seen the anchor device this scan tick" state machine, kept
 * separate from any real BLE code so it's trivially unit-testable.
 *
 * - Any sighting resets the miss counter and re-arms the tracker.
 * - `missThreshold` consecutive misses while armed triggers a lock, then
 *   disarms — so a still-absent anchor doesn't fire `lock` again every tick.
 *   The anchor has to be seen again (re-arming) before it can trigger once more.
 */
export class ProximityTracker {
  private consecutiveMisses = 0;
  private armed = true;

  constructor(private readonly missThreshold: number) {
    if (missThreshold < 1) throw new Error('missThreshold must be at least 1');
  }

  /** Feed one scan tick's result. Returns true iff this tick should trigger a lock. */
  recordSighting(seen: boolean): boolean {
    if (seen) {
      this.consecutiveMisses = 0;
      this.armed = true;
      return false;
    }

    this.consecutiveMisses += 1;
    if (this.armed && this.consecutiveMisses >= this.missThreshold) {
      this.armed = false;
      return true;
    }
    return false;
  }
}
