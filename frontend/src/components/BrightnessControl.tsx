import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { setBrightness } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';
import { useOptimisticLevel } from '../hooks/useOptimisticLevel';

const STEP = 10;

interface Props {
  /** Laptop's current brightness from the live status heartbeat; null = not yet known or unavailable. */
  level: number | null;
  /** Whether a status payload has arrived yet — distinguishes "still loading" from "no such display". */
  statusLoaded: boolean;
}

// Same stepper pattern as VolumeControl. Brightness now arrives on the status
// heartbeat alongside everything else, rather than being fetched once on
// mount — so changing brightness on the laptop is reflected here instead of
// leaving a stale value that the next tap would snap back to.
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

  const disabled = busy || level == null;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>Brightness</Text>
      <View style={styles.controls}>
        <Pressable
          style={[styles.stepButton, disabled && styles.stepButtonDisabled]}
          disabled={disabled}
          onPress={() => apply(level! - STEP)}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.value}>{level != null ? `${level}%` : '…'}</Text>
        <Pressable
          style={[styles.stepButton, disabled && styles.stepButtonDisabled]}
          disabled={disabled}
          onPress={() => apply(level! + STEP)}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 14,
  },
  label: { fontSize: 16, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: { backgroundColor: '#9ca3af' },
  stepText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  value: { fontSize: 16, minWidth: 48, textAlign: 'center' },
});
