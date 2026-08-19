import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { setVolume } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';

// A stepper rather than a drag slider — keeps the MVP free of an extra native
// slider dependency (@react-native-community/slider). Revisit if that's worth
// adding once the core flow is proven out.
export function VolumeControl() {
  const [level, setLevel] = useState(50);
  const [busy, setBusy] = useState(false);

  const apply = async (next: number) => {
    const clamped = Math.max(0, Math.min(100, next));
    setLevel(clamped);
    setBusy(true);
    try {
      await setVolume(clamped);
    } catch (err) {
      Alert.alert('Volume change failed', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <Text style={styles.label}>Volume</Text>
      <View style={styles.controls}>
        <Pressable style={styles.stepButton} disabled={busy} onPress={() => apply(level - 10)}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.value}>{level}%</Text>
        <Pressable style={styles.stepButton} disabled={busy} onPress={() => apply(level + 10)}>
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
  stepText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  value: { fontSize: 16, minWidth: 48, textAlign: 'center' },
});
