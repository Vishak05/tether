import { StyleSheet, Text, View } from 'react-native';

import type { StatusResponse } from '../types/api';

interface StatusCardProps {
  status?: StatusResponse;
  isLoading: boolean;
  isError: boolean;
  connected?: boolean;
}

export function StatusCard({ status, isLoading, isError, connected }: StatusCardProps) {
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
  const system = state?.system;
  const idleSecs = state?.idle_secs;

  const idleLabel = (secs: number): string => {
    if (secs < 60) return `${Math.round(secs)}s`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m`;
    return `${Math.round(mins / 60)}h`;
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.laptopId}>{status.laptop_id}</Text>
        <View style={styles.badgeGroup}>
          <View style={[styles.badge, connected ? styles.badgeLive : styles.badgeStale]}>
            <Text style={styles.badgeText}>{connected ? 'Live' : 'Reconnecting…'}</Text>
          </View>
          <View style={[styles.badge, state?.locked ? styles.badgeLocked : styles.badgeUnlocked]}>
            <Text style={styles.badgeText}>{state?.locked ? 'Locked' : 'Unlocked'}</Text>
          </View>
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

      {idleSecs != null ? (
        <Text style={styles.line}>Idle for {idleLabel(idleSecs)}</Text>
      ) : null}

      {system ? (
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{Math.round(system.cpu_percent)}%</Text>
            <Text style={styles.statLabel}>CPU</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{Math.round(system.memory_percent)}%</Text>
            <Text style={styles.statLabel}>RAM</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{Math.round(system.disk_percent)}%</Text>
            <Text style={styles.statLabel}>Disk</Text>
          </View>
        </View>
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
  badgeGroup: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeLocked: { backgroundColor: '#fde68a' },
  badgeUnlocked: { backgroundColor: '#bbf7d0' },
  badgeLive: { backgroundColor: '#bbf7d0' },
  badgeStale: { backgroundColor: '#e5e7eb' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statTile: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  statValue: { fontSize: 15, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#666' },
});
