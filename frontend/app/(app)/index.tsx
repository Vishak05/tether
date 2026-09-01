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
import { Disclosure } from '../../src/components/ui/Disclosure';
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

/**
 * The control panel.
 *
 * Ordered by how often you reach for something, not by category tidiness:
 * Lock is the most-used action in the app and has to be reachable without
 * scrolling. Everything that isn't reached for constantly is either folded
 * (restart/shutdown, status details) or pooled into one card, because each
 * additional card costs ~50dp of padding and label before it shows anything.
 */
export default function DashboardScreen() {
  const { baseUrl } = useAuth();
  const { status, isLoading, isError, connected } = useLiveStatus();

  return (
    <Screen title="Tether" subtitle={baseUrl ?? undefined}>
      <StatusCard status={status} isLoading={isLoading} isError={isError} connected={connected} />

      {/* Controls hang off the tether rail, which is tinted while the socket
          is live. */}
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

          {/* Folded: rarely used, and the extra tap is a feature in front of
              powering off a machine you aren't sitting at. */}
          <Disclosure label="Restart / shut down">
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
          </Disclosure>
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

        {/* Media, Wi-Fi and screenshot were three separate cards. They have
            nothing in common beyond being occasional, and three cards' worth
            of chrome to say so wasn't worth ~150dp. */}
        <Card label="More">
          <MediaControls />
          <Divider />
          <CommandButton label="Toggle Wi-Fi" onPress={() => toggleWifi(null)} />
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
