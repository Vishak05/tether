import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { sendMediaKey, type MediaAction } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';

const BUTTONS: { action: MediaAction; label: string }[] = [
  { action: 'previous', label: '⏮' },
  { action: 'play_pause', label: '⏯' },
  { action: 'next', label: '⏭' },
];

export function MediaControls() {
  const press = async (action: MediaAction) => {
    try {
      await sendMediaKey(action);
    } catch (err) {
      Alert.alert('Media control failed', getApiErrorMessage(err));
    }
  };

  return (
    <View style={styles.row}>
      {BUTTONS.map(({ action, label }) => (
        <Pressable key={action} style={styles.button} onPress={() => press(action)}>
          <Text style={styles.buttonText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 20 },
});
