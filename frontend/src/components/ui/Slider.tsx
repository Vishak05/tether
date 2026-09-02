import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { color, HIT, radius, space, type } from '../../theme';

interface SliderProps {
  label: string;
  /** Current level 0-100, or null when the laptop hasn't reported one. */
  level: number | null;
  /** Fired once, on release — not continuously during the drag. */
  onCommit: (next: number) => void;
  disabled?: boolean;
  /** Step used by the accessibility increment/decrement actions. */
  step?: number;
}

const TRACK_H = 6;
const THUMB = 20;

/**
 * A drag slider for a 0-100 level.
 *
 * Hand-rolled on PanResponder because @react-native-community/slider is a
 * native module and would invalidate the existing dev build.
 *
 * The important behaviour is that it commits on release only. Each change is
 * an HTTP round trip to the agent, so firing per drag frame would mean dozens
 * of requests for one gesture and a value that lands wherever the last
 * in-flight response happened to resolve. During the drag the thumb follows
 * the finger locally; the laptop hears about it once.
 *
 * Because there are no +/- buttons, the accessibility actions are the only
 * way to adjust this with a screen reader — hence the explicit adjustable
 * role rather than leaving it as an unlabelled view.
 */
export function Slider({ label, level, onCommit, disabled = false, step = 5 }: SliderProps) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);

  // Refs shadow the state because the PanResponder closure is created once
  // and would otherwise capture stale values mid-gesture.
  const widthRef = useRef(0);
  const startPct = useRef(0);
  const current = useRef(0);

  const inert = disabled || level == null;
  const value = drag ?? level ?? 0;

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !inert,
        onMoveShouldSetPanResponder: () => !inert,
        onPanResponderGrant: (evt) => {
          if (widthRef.current <= 0) return;
          // Tap-to-seek: jump to wherever the finger landed, then track
          // relative movement from there.
          const pct = clamp((evt.nativeEvent.locationX / widthRef.current) * 100);
          startPct.current = pct;
          current.current = pct;
          setDrag(pct);
        },
        onPanResponderMove: (_evt, gesture) => {
          if (widthRef.current <= 0) return;
          const pct = clamp(startPct.current + (gesture.dx / widthRef.current) * 100);
          current.current = pct;
          setDrag(pct);
        },
        onPanResponderRelease: () => {
          setDrag(null);
          onCommit(current.current);
        },
        onPanResponderTerminate: () => setDrag(null),
      }),
    [inert, onCommit],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (inert || level == null) return;
    if (e.nativeEvent.actionName === 'increment') onCommit(clamp(level + step));
    if (e.nativeEvent.actionName === 'decrement') onCommit(clamp(level - step));
  };

  const thumbX = width > 0 ? (value / 100) * width : 0;

  return (
    <View style={styles.root}>
      <View style={styles.headRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.readout}>{level != null ? `${value}%` : '—'}</Text>
      </View>

      <View
        style={styles.gesture}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inert }}
        accessibilityValue={level != null ? { min: 0, max: 100, now: value } : undefined}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        {...responder.panHandlers}
      >
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${value}%`, backgroundColor: inert ? color.line : color.signal },
            ]}
          />
        </View>
        {!inert ? (
          <View
            style={[
              styles.thumb,
              // Centred on the fill edge, and shifted back by half its own
              // width so it doesn't overhang either end of the track.
              { transform: [{ translateX: thumbX - THUMB / 2 }] },
              drag != null ? styles.thumbActive : null,
            ]}
            pointerEvents="none"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: type.label,
  readout: type.readout,
  // A full 44dp of grabbable height around a 6dp track: the track is the
  // visual, this is the target.
  gesture: { height: HIT, justifyContent: 'center' },
  track: {
    height: TRACK_H,
    borderRadius: radius.pill,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: color.signal,
    borderWidth: 3,
    borderColor: color.bg,
  },
  thumbActive: { backgroundColor: color.text, borderColor: color.signal },
});
