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
 * Cards are grouped by the part of the machine they touch, and ordered by how
 * often you reach for them. Those are two different jobs: an earlier pass
 * grouped by frequency too, which collected the leftovers into a card that
 * could only honestly be called "More". Grouping by subject gives every
 * action a home — sound controls sit with sound, screen controls with screen.
 *
 * Rarely-used things are folded rather than cut: restart/shutdown behind a
 * disclosure, status details behind another. Each additional card costs ~50dp
 * of padding and label before showing anything, so cards are spent carefully.
 */
export default function DashboardScreen() {
  const { baseUrl } = useAuth();
  const { status, isLoading, isError, connected } = useLiveStatus();

  // Both are driven by the live status heartbeat rather than local state, so
  // they show the laptop's real levels and keep tracking them. Threaded from
  // here because useLiveStatus opens a WebSocket per call — calling it inside
  // each control would open duplicate connections.
  const volume = status?.state?.volume ?? null;
  const brightness = status?.state?.brightness ?? null;
  const statusLoaded = status?.state != null;

  // Mirrors BrightnessControl's own hide rule (it renders null when the
  // laptop has no brightness-capable display). Repeated out here because the
  // divider between it and the screenshot button lives at this level and
  // would otherwise be left leading the card with nothing above it.
  const showBrightness = !statusLoaded || brightness != null;

  return (
    <Screen title="Tether" subtitle={baseUrl ?? undefined}>
      <StatusCard status={status} isLoading={isLoading} isError={isError} connected={connected} />

      {/* Controls hang off the tether rail, which is tinted while the socket
          is live. */}
      <TetherRail connected={!!connected}>
        <Card label="System">
          <View style={styles.pair}>
            <View style={styles.half}>
              <CommandButton label="Lock" onPress={lock} />
            </View>
            <View style={styles.half}>
              <CommandButton label="Sleep" onPress={sleep} />
            </View>
          </View>

          <CommandButton label="Toggle Wi-Fi" onPress={() => toggleWifi(null)} />

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

        <Card label="Sound">
          <VolumeControl level={volume} />
          <Divider />
          <MediaControls />
        </Card>

        <Card label="Display">
          {showBrightness ? (
            <>
              <BrightnessControl level={brightness} statusLoaded={statusLoaded} />
              <Divider />
            </>
          ) : null}
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
