import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { sendMediaKey, type MediaAction } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';
import { color, HIT, radius, space } from '../theme';
import { usePressScale } from './ui/usePressScale';

const BUTTONS: { action: MediaAction; label: string; a11y: string; primary?: boolean }[] = [
  { action: 'previous', label: '⏮', a11y: 'Previous track' },
  { action: 'play_pause', label: '⏯', a11y: 'Play or pause', primary: true },
  { action: 'next', label: '⏭', a11y: 'Next track' },
];

/**
 * Transport keys.
 *
 * Play/pause is the accent key and the other two are neutral, because in a row
 * of three identical buttons nothing tells you where to aim — and this is a
 * control used without looking closely.
 */
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
      {BUTTONS.map(({ action, label, a11y, primary }) => (
        <MediaKey key={action} label={label} a11y={a11y} primary={primary} onPress={() => press(action)} />
      ))}
    </View>
  );
}

function MediaKey({
  label,
  a11y,
  primary,
  onPress,
}: {
  label: string;
  a11y: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.94);
  return (
    <Animated.View style={[styles.keyWrap, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11y}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.key,
          primary ? styles.keyPrimary : null,
          pressed ? (primary ? styles.keyPrimaryPressed : styles.keyPressed) : null,
        ]}
      >
        <Text style={[styles.keyText, primary ? styles.keyTextPrimary : null]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  keyWrap: { flex: 1, borderRadius: radius.md },
  key: {
    minHeight: HIT + space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: color.line, borderColor: color.lineStrong },
  keyPrimary: { backgroundColor: color.signalWash, borderColor: color.signal },
  keyPrimaryPressed: { backgroundColor: color.signal, borderColor: color.signal },
  keyText: { fontSize: 20, color: color.textDim, lineHeight: 24 },
  keyTextPrimary: { color: color.signal },
});
