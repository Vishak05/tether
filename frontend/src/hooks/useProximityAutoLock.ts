import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { lock } from '../api/commands';
import { requestBlePermissions, scanForAnchor } from '../ble/manager';
import { getAutoLockAnchor, getAutoLockEnabled, type AutoLockAnchor } from '../auth/secureStore';
import { ProximityTracker } from '../utils/proximityTracker';

const SCAN_WINDOW_MS = 3000;
const CYCLE_INTERVAL_MS = 7000; // time between the start of one scan and the next
const MISS_THRESHOLD = 3; // consecutive misses before locking (~3 cycles ≈ 30s)

/**
 * Foreground-only proximity auto-lock: while enabled, an anchor is set, and
 * the app is in the foreground, periodically scans for the anchor device and
 * locks the laptop once it's been missing for MISS_THRESHOLD consecutive
 * scans. Does nothing while backgrounded — see docs/phaseAutoLock_summary.md
 * for why a real background BLE service was out of scope for this pass.
 */
export function useProximityAutoLock() {
  const [enabled, setEnabled] = useState(false);
  const [anchor, setAnchor] = useState<AutoLockAnchor | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  // Re-read persisted settings whenever the app returns to foreground, so
  // toggling in Settings takes effect without needing an explicit refresh call.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!appActive) return;
    let cancelled = false;
    (async () => {
      const [storedEnabled, storedAnchor] = await Promise.all([getAutoLockEnabled(), getAutoLockAnchor()]);
      if (!cancelled) {
        setEnabled(storedEnabled);
        setAnchor(storedAnchor);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appActive]);

  const trackerRef = useRef<ProximityTracker | null>(null);

  useEffect(() => {
    if (!appActive || !enabled || !anchor) {
      trackerRef.current = null;
      return;
    }

    trackerRef.current = new ProximityTracker(MISS_THRESHOLD);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const cycle = async () => {
      if (cancelled) return;
      const hasPermission = await requestBlePermissions();
      if (!hasPermission || cancelled) {
        timer = setTimeout(cycle, CYCLE_INTERVAL_MS);
        return;
      }

      const seen = await scanForAnchor(anchor.id, SCAN_WINDOW_MS);
      if (cancelled) return;

      const shouldLock = trackerRef.current?.recordSighting(seen) ?? false;
      if (shouldLock) {
        lock().catch(() => {
          // Best-effort — if the laptop's unreachable there's nothing more to do here.
        });
      }

      timer = setTimeout(cycle, CYCLE_INTERVAL_MS);
    };

    cycle();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [appActive, enabled, anchor]);

  return { enabled, anchor, active: appActive && enabled && !!anchor };
}
