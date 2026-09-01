import { Alert, StyleSheet, View } from 'react-native';

import { lock, restart, shutdown, sleep, toggleWifi } from '../../src/api/commands';
import { useAuth } from '../../src/auth/AuthContext';
import { BrightnessControl } from '../../src/components/BrightnessControl';
import { CommandButton } from '../../src/components/CommandButton';
import { MediaControls } from '../../src/components/MediaControls';
import { ScreenshotViewer } from '../../src/components/ScreenshotViewer';
import { StatusCard } from '../../src/components/StatusCard';
import { VolumeControl } from '../../src/components/VolumeControl';
import { Card, Divider } from '../../src/components/ui/Card';
import { Screen } from '../../src/components/ui/Screen';
import { TetherRail } from '../../src/components/ui/TetherRail';
import { useLiveStatus } from '../../src/hooks/useLiveStatus';
import { space } from '../../src/theme';

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
  const { baseUrl } = useAuth();
  const { status, isLoading, isError, connected } = useLiveStatus();

  return (
    <Screen title="Tether" subtitle={baseUrl ?? undefined}>
      <StatusCard status={status} isLoading={isLoading} isError={isError} connected={connected} />

      {/* Controls hang off the tether rail, which is tinted while the socket
          is live. Grouping them into labelled cards replaces what used to be
          one undifferentiated column of buttons. */}
      <TetherRail connected={!!connected}>
        <Card label="Power">
          <View style={styles.pair}>
            <View style={styles.half}>
              <CommandButton label="Lock" onPress={lock} />
            </View>
            <View style={styles.half}>
              <CommandButton label="Sleep" onPress={sleep} />
            </View>
          </View>
          <Divider />
          <View style={styles.pair}>
            <View style={styles.half}>
              <CommandButton
                label="Restart"
                variant="danger"
                onPress={confirmThen('Restart', 'Restart the laptop now? Any unsaved work will be lost.', restart)}
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
        </Card>

        {/* Both are driven by the live status heartbeat rather than their own
            local state, so they show the laptop's real levels and keep
            tracking them. The values are threaded through from here because
            useLiveStatus opens a WebSocket per call — calling it inside each
            control would open duplicate connections. */}
        <Card label="Levels">
          <VolumeControl level={status?.state?.volume ?? null} />
          <Divider />
          <BrightnessControl
            level={status?.state?.brightness ?? null}
            statusLoaded={status?.state != null}
          />
        </Card>

        <Card label="Media">
          <MediaControls />
        </Card>

        <Card label="Network">
          <CommandButton label="Toggle Wi-Fi" onPress={() => toggleWifi(null)} />
        </Card>

        <Card label="Screen">
          <ScreenshotViewer />
        </Card>
      </TetherRail>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1 },
});
