import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getBrightness, setBrightness } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';

// Same stepper pattern as VolumeControl — unlike volume, brightness has a
// GET endpoint, so this starts from the laptop's actual current value
// instead of a guessed default.
export function BrightnessControl() {
  const [level, setLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { result } = await getBrightness();
        if (result) setLevel(result.brightness);
        else setUnsupported(true);
      } catch {
        setUnsupported(true);
      }
    })();
  }, []);

  if (unsupported) return null;

  const apply = async (next: number) => {
    const clamped = Math.max(0, Math.min(100, next));
    setLevel(clamped);
    setBusy(true);
    try {
      await setBrightness(clamped);
    } catch (err) {
      Alert.alert('Brightness change failed', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <Text style={styles.label}>Brightness</Text>
      <View style={styles.controls}>
        <Pressable style={styles.stepButton} disabled={busy || level == null} onPress={() => apply((level ?? 50) - 10)}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.value}>{level != null ? `${level}%` : '…'}</Text>
        <Pressable style={styles.stepButton} disabled={busy || level == null} onPress={() => apply((level ?? 50) + 10)}>
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
