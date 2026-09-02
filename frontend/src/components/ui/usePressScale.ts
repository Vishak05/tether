import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

/**
 * Tactile press feedback: a small scale-down while a control is held.
 *
 * Uses RN's built-in Animated with the native driver — Reanimated would be a
 * native module and force a rebuild. Transform-only, so it stays on the UI
 * thread and doesn't jank while a command request is in flight.
 *
 * Honours the OS "reduce motion" setting by collapsing to no movement. The
 * press is still communicated by the opacity and surface changes on the
 * control itself, so nothing is lost.
 */
export function usePressScale(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const animate = (toValue: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  return {
    scale,
    onPressIn: () => animate(to),
    onPressOut: () => animate(1),
  };
}
