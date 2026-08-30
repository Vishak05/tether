import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { lock, restart, shutdown, sleep, toggleWifi } from '../../src/api/commands';
import { BrightnessControl } from '../../src/components/BrightnessControl';
import { CommandButton } from '../../src/components/CommandButton';
import { MediaControls } from '../../src/components/MediaControls';
import { ScreenshotViewer } from '../../src/components/ScreenshotViewer';
import { StatusCard } from '../../src/components/StatusCard';
import { VolumeControl } from '../../src/components/VolumeControl';
import { useLiveStatus } from '../../src/hooks/useLiveStatus';

// Wraps a destructive action behind a confirm dialog, resolving/rejecting so
// it can still be passed straight to CommandButton's onPress (which awaits
// it and shows its own error alert on rejection).
function confirmThen(title: string, message: string, action: () => Promise<unknown>): () => Promise<unknown> {
  return () =>
    new Promise((resolve, reject) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('cancelled')) },
        { text: title, style: 'destructive', onPress: () => action().then(resolve, reject) },
      ]);
    }).catch((err) => {
      if (err instanceof Error && err.message === 'cancelled') return; // silent — user chose not to
      throw err;
    });
}

export default function DashboardScreen() {
  const { status, isLoading, isError, connected } = useLiveStatus();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusCard status={status} isLoading={isLoading} isError={isError} connected={connected} />

      <View style={styles.row}>
        <View style={styles.half}>
          <CommandButton label="Lock" onPress={lock} />
        </View>
        <View style={styles.half}>
          <CommandButton label="Sleep" variant="danger" onPress={sleep} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <CommandButton
            label="Restart"
            variant="danger"
            onPress={confirmThen('Restart', "Restart the laptop now? Any unsaved work will be lost.", restart)}
          />
        </View>
        <View style={styles.half}>
          <CommandButton
            label="Shut Down"
            variant="danger"
            onPress={confirmThen('Shut Down', "Shut down the laptop now? You'll need physical access to turn it back on.", shutdown)}
          />
        </View>
      </View>

      {/* Both are driven by the live status heartbeat rather than their own
          local state, so they show the laptop's real levels and keep tracking
          them. The values are threaded through from here because useLiveStatus
          opens a WebSocket per call — calling it inside each control would
          open duplicate connections. */}
      <VolumeControl level={status?.state?.volume ?? null} />
      <BrightnessControl
        level={status?.state?.brightness ?? null}
        statusLoaded={status?.state != null}
      />
      <MediaControls />

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
