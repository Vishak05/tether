import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { color, space } from '../../theme';

const RAIL = 20;
const NUB = 9;
/** Vertical offset that lands a nub on its card's label row. */
const NUB_DROP = 22;

interface TetherRailProps {
  children: ReactNode;
  /** Live WebSocket link. Drives the rail's colour — this is real state. */
  connected: boolean;
}

/**
 * The tether: a continuous rail down the left edge with a connector nub at
 * each control block.
 *
 * It draws the thing the app is named after. The rail is tinted and its nubs
 * are filled while the socket is live, and both fall back to the inert border
 * colour when it drops — so the link's health is legible from the shape of
 * the screen, before reading a word of it. This is the one decorative liberty
 * in the design, and it earns its place by being driven by real state rather
 * than being ornament.
 */
export function TetherRail({ children, connected }: TetherRailProps) {
  const items = Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.root}>
      <View
        style={[styles.line, { backgroundColor: connected ? color.live : color.line }]}
        pointerEvents="none"
      />
      <View style={styles.stack}>
        {items.map((child, i) => (
          <View style={styles.item} key={i}>
            <View style={styles.gutter}>
              <View
                style={[
                  styles.nub,
                  connected
                    ? { backgroundColor: color.live, borderColor: color.live }
                    : { backgroundColor: color.bg, borderColor: color.line },
                ]}
              />
            </View>
            <View style={styles.body}>{child}</View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  line: {
    position: 'absolute',
    left: RAIL / 2 - 1,
    top: NUB_DROP,
    bottom: NUB_DROP,
    width: 2,
    borderRadius: 1,
    opacity: 0.5,
  },
  stack: { gap: space.md },
  item: { flexDirection: 'row', alignItems: 'flex-start' },
  gutter: { width: RAIL, alignItems: 'center', paddingTop: NUB_DROP - NUB / 2 },
  nub: {
    width: NUB,
    height: NUB,
    borderRadius: NUB / 2,
    borderWidth: 2,
  },
  body: { flex: 1, paddingLeft: space.sm },
});
