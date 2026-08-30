import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { setVolume } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';
import { useOptimisticLevel } from '../hooks/useOptimisticLevel';

const STEP = 10;

interface Props {
  /** Laptop's current volume from the live status heartbeat; null = not yet known or unavailable. */
  level: number | null;
}

// A stepper rather than a drag slider — keeps the MVP free of an extra native
// slider dependency (@react-native-community/slider). Revisit if that's worth
// adding once the core flow is proven out.
//
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

  const disabled = busy || level == null;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>Volume</Text>
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
