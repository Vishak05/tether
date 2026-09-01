import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, space, type } from '../../theme';

interface DisclosureProps {
  /** Shown when collapsed, e.g. "Restart / shut down". */
  label: string;
  children: ReactNode;
  /** Starts open. Defaults to closed — the point is to reclaim the space. */
  defaultOpen?: boolean;
}

/**
 * A fold for content that's worth having but not worth permanent screen space.
 *
 * Deliberately not animated: RN can't animate to an unmeasured auto height
 * without either a layout pass or LayoutAnimation, and a half-second expand
 * on a control panel is friction, not polish.
 *
 * Used for destructive actions, where the extra tap is a feature — it puts a
 * deliberate step in front of shutting down a machine you're not sitting at.
 */
export function Disclosure({ label, children, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.trigger, pressed ? styles.triggerPressed : null]}
      >
        <Text style={styles.chevron}>{open ? '⌄' : '›'}</Text>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {open ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderRadius: 8,
  },
  triggerPressed: { backgroundColor: color.surfaceRaised },
  chevron: { color: color.signal, fontSize: 14, fontWeight: '700', width: 12, textAlign: 'center' },
  label: { ...type.label, color: color.textDim },
  content: { gap: space.sm },
});
