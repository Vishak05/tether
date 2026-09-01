import { useState } from 'react';
import { Alert } from 'react-native';

import { setBrightness } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';
import { useOptimisticLevel } from '../hooks/useOptimisticLevel';
import { Slider } from './ui/Slider';

interface Props {
  /** Laptop's current brightness from the live status heartbeat; null = not yet known or unavailable. */
  level: number | null;
  /** Whether a status payload has arrived yet — distinguishes "still loading" from "no such display". */
  statusLoaded: boolean;
}

// Brightness arrives on the status heartbeat alongside everything else, rather
// than being fetched once on mount — so changing brightness on the laptop is
// reflected here instead of leaving a stale value that the next tap would snap
// back to.
export function BrightnessControl({ level: serverLevel, statusLoaded }: Props) {
  const { level, setPending } = useOptimisticLevel(serverLevel);
  const [busy, setBusy] = useState(false);

  // No brightness-capable display (desktop, or an external monitor that
  // doesn't expose WMI brightness) — the laptop reports null, so hide the
  // control entirely. Only once status has actually loaded, otherwise this
  // would flicker out during the initial connect.
  if (statusLoaded && level == null) return null;

  const apply = async (next: number) => {
    const clamped = Math.max(0, Math.min(100, next));
    setPending(clamped);
    setBusy(true);
    try {
      await setBrightness(clamped);
    } catch (err) {
      setPending(null); // drop back to whatever the laptop actually reports
      Alert.alert('Brightness change failed', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return <Slider label="Brightness" level={level} onCommit={apply} disabled={busy} />;
}
