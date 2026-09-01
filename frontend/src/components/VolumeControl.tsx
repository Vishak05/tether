import { useState } from 'react';
import { Alert } from 'react-native';

import { setVolume } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';
import { useOptimisticLevel } from '../hooks/useOptimisticLevel';
import { Stepper } from './ui/Stepper';

interface Props {
  /** Laptop's current volume from the live status heartbeat; null = not yet known or unavailable. */
  level: number | null;
}

// The displayed value comes from the laptop and keeps tracking it; this
// component holds no independent notion of the volume. It used to start from
// a hardcoded 50, which meant the reading was wrong until you touched it and
// the first tap computed its target from that fiction — sending the laptop to
// 40 or 60 from wherever it really was.
export function VolumeControl({ level: serverLevel }: Props) {
  const { level, setPending } = useOptimisticLevel(serverLevel);
  const [busy, setBusy] = useState(false);

  const apply = async (next: number) => {
    const clamped = Math.max(0, Math.min(100, next));
    setPending(clamped);
    setBusy(true);
    try {
      await setVolume(clamped);
    } catch (err) {
      setPending(null); // drop back to whatever the laptop actually reports
      Alert.alert('Volume change failed', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return <Stepper label="Volume" level={level} onStep={apply} disabled={busy} />;
}
