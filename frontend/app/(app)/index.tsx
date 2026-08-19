import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';

import { fetchStatus } from '../../src/api/status';
import { lock, sleep, toggleWifi } from '../../src/api/commands';
import { CommandButton } from '../../src/components/CommandButton';
import { ScreenshotViewer } from '../../src/components/ScreenshotViewer';
import { StatusCard } from '../../src/components/StatusCard';
import { VolumeControl } from '../../src/components/VolumeControl';

// Polls GET /status until Phase 4 replaces this with the WebSocket heartbeat.
const STATUS_POLL_MS = 5000;

export default function DashboardScreen() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: STATUS_POLL_MS,
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusCard status={data} isLoading={isLoading} isError={isError} />

      <View style={styles.row}>
        <View style={styles.half}>
          <CommandButton label="Lock" onPress={lock} />
        </View>
        <View style={styles.half}>
          <CommandButton label="Sleep" variant="danger" onPress={sleep} />
        </View>
      </View>

      <VolumeControl />

      <CommandButton label="Toggle Wi-Fi" onPress={() => toggleWifi(null)} />

      <ScreenshotViewer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
