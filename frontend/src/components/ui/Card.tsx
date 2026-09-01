import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { color, elevation, radius, space, type } from '../../theme';

interface CardProps {
  children: ReactNode;
  /** Wide-tracked instrument label above the card's content. */
  label?: string;
  /** Right-aligned companion to the label — a count, a state, a unit. */
  labelRight?: string;
  /** Nested blocks sit on the raised surface so they read above the card. */
  raised?: boolean;
  style?: ViewStyle;
}

/**
 * The standard surface.
 *
 * Definition comes from three stacked cues rather than a shadow alone: a
 * surface lighter than the ground, a hairline border, and a soft cast shadow.
 * On a dark ground the shadow contributes least, so the border is what
 * actually keeps the card from dissolving into the background.
 */
export function Card({ children, label, labelRight, raised = false, style }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        raised ? styles.raised : null,
        raised ? elevation.raised : elevation.card,
        style,
      ]}
    >
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {labelRight ? <Text style={styles.labelRight}>{labelRight}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A hairline rule for separating blocks inside a card. */
export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.md,
    gap: space.sm,
  },
  raised: { backgroundColor: color.surfaceRaised },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  label: type.label,
  labelRight: { ...type.label, color: color.textDim },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.line,
    marginVertical: space.sm,
  },
});
