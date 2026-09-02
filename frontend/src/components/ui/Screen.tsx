import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, space, type } from '../../theme';

interface ScreenProps {
  children: ReactNode;
  /** Renders a sticky header that stays put while the body scrolls. */
  title?: string;
  /** Small line under the title — a status or context line, not a tagline. */
  subtitle?: string;
  /** Set false for screens that own their own scrolling (e.g. a FlatList). */
  scroll?: boolean;
}

/**
 * Standard screen frame: app ground, safe-area handling, and an optional
 * sticky header.
 *
 * The header sits outside the scroll view rather than scrolling away, so the
 * machine you're controlling is always named on screen — with several paired
 * laptops the alternative is acting on the wrong one.
 *
 * Bottom inset is added to the scroll content rather than the container, so
 * content can pass under the home indicator while still being fully
 * scrollable past it.
 */
export function Screen({ children, title, subtitle, scroll = true }: ScreenProps) {
  const insets = useSafeAreaInsets();

  const header = title ? (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  ) : null;

  const body = (
    <View style={[styles.body, { paddingBottom: insets.bottom + space.lg }]}>{children}</View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    backgroundColor: color.bg,
    gap: space.xs,
  },
  title: type.display,
  subtitle: type.caption,
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  body: { flex: 1, paddingHorizontal: space.md, paddingTop: space.md, gap: space.md },
});
