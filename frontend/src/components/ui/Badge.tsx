import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { color, radius, space, type } from '../../theme';

export type BadgeTone = 'live' | 'idle' | 'warn' | 'danger';

const TONE: Record<BadgeTone, { fg: string; bg: string; border: string }> = {
  live: { fg: color.live, bg: color.liveWash, border: color.live },
  idle: { fg: color.textMuted, bg: 'transparent', border: color.line },
  warn: { fg: color.warn, bg: color.warnWash, border: color.warn },
  danger: { fg: color.danger, bg: color.dangerWash, border: color.danger },
};

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Adds a slowly breathing dot. Only meaningful for a live/ongoing state. */
  pulse?: boolean;
}

/**
 * A small state chip.
 *
 * Tinted wash plus a coloured border rather than a solid fill: at this size a
 * solid block of colour competes with the primary action buttons, and these
 * are readouts, not controls.
 */
export function Badge({ label, tone = 'idle', pulse = false }: BadgeProps) {
  const t = TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      {pulse ? <PulseDot color={t.fg} /> : null}
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/**
 * A breathing dot for "this is live right now".
 *
 * The animation is the point — a static dot can't distinguish a live feed
 * from a frozen one. Falls back to a solid dot under "reduce motion", which
 * still carries the colour signal.
 */
export function PulseDot({ color: dotColor, size = 6 }: { color: string; size?: number }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: dotColor,
        opacity,
      }}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: { ...type.label, fontSize: 10, letterSpacing: 1 },
});
