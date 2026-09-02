import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { color, HIT, radius, space, type } from '../../theme';
import { usePressScale } from './usePressScale';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  /** Tighter control for inline use inside a list row. */
  compact?: boolean;
  style?: ViewStyle;
}

const FILL: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: color.signal, borderColor: color.signal },
  // Secondary carries a tinted wash rather than a flat grey, so a row of
  // secondary actions still reads as part of the accent system.
  secondary: { backgroundColor: color.surfaceRaised, borderColor: color.line },
  danger: { backgroundColor: color.dangerWash, borderColor: color.danger },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
};

const PRESSED: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: color.signalDeep, borderColor: color.signalDeep },
  secondary: { backgroundColor: color.line, borderColor: color.lineStrong },
  danger: { backgroundColor: color.dangerDeep, borderColor: color.dangerDeep },
  ghost: { backgroundColor: color.surfaceRaised },
};

const TEXT: Record<ButtonVariant, string> = {
  primary: color.onAccent,
  secondary: color.text,
  danger: color.danger,
  ghost: color.signal,
};

/**
 * The app's action control.
 *
 * Press feedback is layered: the whole control scales down slightly, and the
 * fill deepens. Both matter — the scale reads as tactile, but it's suppressed
 * under "reduce motion", and the colour shift is what still communicates the
 * press in that case.
 *
 * `busy` swaps the label for a spinner rather than dimming the control, so a
 * command that takes a moment (screenshots, Wi-Fi toggles) is visibly working
 * instead of just unresponsive. Width doesn't change, so rows don't reflow.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  compact = false,
  style,
}: ButtonProps) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const inert = disabled || busy;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, styles.wrap, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: inert, busy }}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={inert}
        style={({ pressed }) => [
          styles.button,
          compact ? styles.compact : null,
          FILL[variant],
          pressed && !inert ? PRESSED[variant] : null,
          disabled ? styles.disabled : null,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={TEXT[variant]} />
        ) : (
          <Text
            style={[styles.text, compact ? styles.textCompact : null, { color: TEXT[variant] }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md },
  button: {
    minHeight: HIT + space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: HIT, paddingVertical: space.sm, paddingHorizontal: space.md },
  text: type.button,
  textCompact: { fontSize: 14 },
  disabled: { opacity: 0.4 },
});
