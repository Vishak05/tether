import { useEffect, useState } from 'react';

/**
 * Bridges a value that actually lives on the laptop — and is only observed
 * via the ~7s status heartbeat — with a control the user expects to respond
 * to a tap immediately.
 *
 * `serverLevel` is the source of truth. While a change is in flight we show
 * `pending` instead, then drop it as soon as a heartbeat confirms the new
 * value. The timeout is the safety net: if the laptop clamps or rejects the
 * value, the confirming heartbeat never arrives, and without it the UI would
 * be pinned forever to a number that isn't real.
 *
 * Deliberately has no default/fallback value. A control with nothing to show
 * must show nothing and disable itself — seeding local state with a guess is
 * what caused the first volume tap to snap the laptop to a fabricated level.
 */
export function useOptimisticLevel(serverLevel: number | null, timeoutMs = 21000) {
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    if (pending == null) return;

    if (serverLevel === pending) {
      setPending(null);
      return;
    }

    const timer = setTimeout(() => setPending(null), timeoutMs);
    return () => clearTimeout(timer);
  }, [pending, serverLevel, timeoutMs]);

  return { level: pending ?? serverLevel, setPending };
}
