import { StyleSheet, Text, View } from 'react-native';

import { color, radius, space, type } from '../theme';
import type { StatusResponse } from '../types/api';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Disclosure } from './ui/Disclosure';

interface StatusCardProps {
  status?: StatusResponse;
  isLoading: boolean;
  isError: boolean;
  connected?: boolean;
}

export function StatusCard({ status, isLoading, isError, connected }: StatusCardProps) {
  if (isLoading && !status) {
    return (
      <Card label="Machine">
        <Text style={styles.muted}>Reading status…</Text>
      </Card>
    );
  }

  if (isError || !status) {
    return (
      <Card label="Machine" labelRight="No link">
        <Text style={styles.error}>Can&apos;t reach the laptop</Text>
        <Text style={styles.muted}>
          Check the agent is running and the address in Settings is right.
        </Text>
      </Card>
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
    <Card label="Machine">
      <View style={styles.headerRow}>
        <Text style={styles.laptopId} numberOfLines={1}>
          {status.laptop_id}
        </Text>
        <View style={styles.badgeGroup}>
          <Badge
            label={connected ? 'Live' : 'Reconnecting'}
            tone={connected ? 'live' : 'idle'}
            pulse={connected}
          />
          {/* "Unlocked", not "Open" — the shorter word reads as the lid, or a
              session, or anything else. It's the pair to "Locked" or it's
              nothing. */}
          <Badge
            label={state?.locked ? 'Locked' : 'Unlocked'}
            tone={state?.locked ? 'warn' : 'idle'}
          />
        </View>
      </View>

      <Text style={styles.platform}>
        {status.platform} · v{status.version}
      </Text>

      {/* Battery reads as a meter rather than a number: charge level is a
          proportion, and a bar shows it faster than digits do. */}
      {battery ? (
        <View style={styles.batteryBlock}>
          <View style={styles.batteryRow}>
            <Text style={styles.batteryValue}>{battery.percent}%</Text>
            <Text style={styles.muted}>{battery.charging ? 'Charging' : 'On battery'}</Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.max(0, Math.min(100, battery.percent))}%`,
                  backgroundColor: battery.charging
                    ? color.live
                    : battery.percent <= 20
                      ? color.danger
                      : color.signal,
                },
              ]}
            />
          </View>
        </View>
      ) : (
        <Text style={styles.muted}>No battery reported</Text>
      )}

      {/* Folded by default. Name, link state and battery answer "can I reach
          it and is it about to die"; the rest is diagnostics you go looking
          for, and it was costing ~140dp above the first control. */}
      <Disclosure label="Details">
        {activeWindow ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Active</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {activeWindow.title || activeWindow.process}
            </Text>
          </View>
        ) : null}

        {idleSecs != null ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Idle</Text>
            <Text style={styles.metaValue}>{idleLabel(idleSecs)}</Text>
          </View>
        ) : null}

        {system ? (
          <View style={styles.statsRow}>
            <Stat value={system.cpu_percent} label="CPU" />
            <Stat value={system.memory_percent} label="RAM" />
            <Stat value={system.disk_percent} label="Disk" />
          </View>
        ) : null}
      </Disclosure>
    </Card>
  );
}

/** One telemetry tile. Amber above 85% — the only threshold worth flagging. */
function Stat({ value, label }: { value: number; label: string }) {
  const hot = value >= 85;
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, hot ? { color: color.signal } : null]}>
        {Math.round(value)}
        <Text style={styles.statUnit}>%</Text>
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  laptopId: { ...type.title, flexShrink: 1 },
  platform: { ...type.caption, marginTop: -space.xs },
  muted: type.caption,
  error: { ...type.body, color: color.danger, fontWeight: '700' },
  badgeGroup: { flexDirection: 'row', gap: space.xs + 2 },

  batteryBlock: { gap: space.sm, marginTop: space.sm },
  batteryRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  batteryValue: type.readout,
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },

  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  metaKey: { ...type.label, width: 52 },
  metaValue: { ...type.body, flex: 1, color: color.textDim },

  statsRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  statTile: {
    flex: 1,
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    paddingVertical: space.sm + space.xs,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { ...type.readout, fontSize: 18 },
  statUnit: { fontSize: 12, fontWeight: '700', color: color.textMuted },
  statLabel: type.label,
});
