import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';

import { getApiErrorMessage } from '../api/errors';

interface CommandButtonProps {
  label: string;
  onPress: () => Promise<unknown>;
  variant?: 'default' | 'danger';
}

export function CommandButton({ label, onPress, variant = 'default' }: CommandButtonProps) {
  const [busy, setBusy] = useState(false);

  const handlePress = async () => {
    setBusy(true);
    try {
      await onPress();
    } catch (err) {
      Alert.alert('Command failed', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        variant === 'danger' && styles.buttonDanger,
        pressed && styles.buttonPressed,
        busy && styles.buttonBusy,
      ]}
      onPress={handlePress}
      disabled={busy}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDanger: { backgroundColor: '#dc2626' },
  buttonPressed: { opacity: 0.85 },
  buttonBusy: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
