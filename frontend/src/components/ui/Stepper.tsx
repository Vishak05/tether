import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, HIT, radius, space, type } from '../../theme';
import { usePressScale } from './usePressScale';

interface StepperProps {
  label: string;
  /** Current level 0-100, or null when the laptop hasn't reported one. */
  level: number | null;
  onStep: (next: number) => void;
  step?: number;
  disabled?: boolean;
}

/**
 * A level control: label, meter, readout, and -/+ keys.
 *
 * The meter matters more than it looks. A bare number tells you the level but
 * not where it sits in its range, and this is a control you use while looking
 * at a phone rather than at the laptop — the bar makes "nearly muted" and
 * "nearly maxed" readable at a glance.
 *
 * A null level renders as an em dash with the keys disabled, never as a
 * placeholder number. Showing a plausible-looking default here is exactly the
 * bug that made the first tap jump the laptop to a value it had never been at.
 */
export function Stepper({ label, level, onStep, step = 10, disabled = false }: StepperProps) {
  const inert = disabled || level == null;
  const pct = level ?? 0;

  return (
    <View style={styles.root}>
      <View style={styles.headRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.readout}>{level != null ? `${level}%` : '—'}</Text>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct}%`, backgroundColor: inert ? color.line : color.signal },
          ]}
        />
      </View>

      <View style={styles.keys}>
        <StepKey label="−" onPress={() => onStep(pct - step)} disabled={inert} />
        <StepKey label="+" onPress={() => onStep(pct + step)} disabled={inert} />
      </View>
    </View>
  );
}

function StepKey({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.92);
  return (
    <Animated.View style={[styles.keyWrap, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label === '−' ? 'Decrease' : 'Increase'}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        style={({ pressed }) => [
          styles.key,
          pressed && !disabled ? styles.keyPressed : null,
          disabled ? styles.keyDisabled : null,
        ]}
      >
        <Text style={[styles.keyText, disabled ? styles.keyTextDisabled : null]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: type.label,
  readout: type.readout,
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  keys: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  keyWrap: { flex: 1, borderRadius: radius.md },
  key: {
    minHeight: HIT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: color.signalWash, borderColor: color.signal },
  keyDisabled: { opacity: 0.4 },
  keyText: { fontSize: 22, fontWeight: '700', color: color.text, lineHeight: 26 },
  keyTextDisabled: { color: color.textMuted },
});
