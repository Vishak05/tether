import { StyleSheet, Text, View } from 'react-native';

import type { StatusResponse } from '../types/api';

interface StatusCardProps {
  status?: StatusResponse;
  isLoading: boolean;
  isError: boolean;
}

export function StatusCard({ status, isLoading, isError }: StatusCardProps) {
  if (isLoading && !status) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>Loading status…</Text>
      </View>
    );
  }

  if (isError || !status) {
    return (
      <View style={styles.card}>
        <Text style={styles.error}>Couldn't reach the laptop</Text>
      </View>
    );
  }

  const { state } = status;
  const battery = state?.battery;
  const activeWindow = state?.active_window;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.laptopId}>{status.laptop_id}</Text>
        <View style={[styles.badge, state?.locked ? styles.badgeLocked : styles.badgeUnlocked]}>
          <Text style={styles.badgeText}>{state?.locked ? 'Locked' : 'Unlocked'}</Text>
        </View>
      </View>
      <Text style={styles.muted}>{status.platform} · v{status.version}</Text>

      {battery ? (
        <Text style={styles.line}>
          🔋 {battery.percent}% {battery.charging ? '(charging)' : ''}
        </Text>
      ) : (
        <Text style={styles.muted}>No battery reported</Text>
      )}

      {activeWindow ? (
        <Text style={styles.line} numberOfLines={1}>
          Active: {activeWindow.title || activeWindow.process}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16, gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  laptopId: { fontSize: 18, fontWeight: '700' },
  muted: { color: '#666' },
  line: { fontSize: 14, color: '#222' },
  error: { color: '#c0392b' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeLocked: { backgroundColor: '#fde68a' },
  badgeUnlocked: { backgroundColor: '#bbf7d0' },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
