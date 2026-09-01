import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pairDevice } from '../../src/api/auth';
import { getApiErrorMessage } from '../../src/api/errors';
import { useAuth } from '../../src/auth/AuthContext';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { color, radius, space, type } from '../../src/theme';
import { parseTetherPairingUri } from '../../src/utils/pairingUri';

// Scan the QR the agent shows at GET /pair (from a browser on the laptop, or a
// future tray app), or type the pairing_token shown alongside it by hand.
export default function PairScreen() {
  const { completePairing } = useAuth();
  const [mode, setMode] = useState<'choose' | 'scan' | 'manual'>('choose');
  const [token, setToken] = useState('');
  const [deviceName, setDeviceName] = useState('My Phone');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const insets = useSafeAreaInsets();

  const frame = [styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }];

  const submitPairing = async (pairingToken: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await pairDevice({ pairing_token: pairingToken, device_name: deviceName || 'My Phone' });
      await completePairing({
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        deviceId: result.device_id,
      });
      router.replace('/(app)');
    } catch (err) {
      setError(getApiErrorMessage(err));
      setScanned(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    const parsed = parseTetherPairingUri(data);
    if (!parsed) {
      setError('That QR code isn\'t a valid Tether pairing code');
      return;
    }
    setScanned(true);
    submitPairing(parsed.token);
  };

  if (mode === 'choose') {
    return (
      <View style={frame}>
        <View style={styles.body}>
          <View style={styles.head}>
            <Text style={styles.eyebrow}>Step 2 of 2</Text>
            <Text style={styles.title}>Pair with your laptop</Text>
            <Text style={styles.subtitle}>
              Open http://127.0.0.1:8765/pair/view in a browser on the laptop, then scan the QR
              code it shows or type the code printed underneath it.
            </Text>
          </View>

          <View style={styles.actions}>
            <Button label="Scan QR code" onPress={() => setMode('scan')} />
            <Button label="Enter code manually" variant="secondary" onPress={() => setMode('manual')} />
          </View>
        </View>

        <Pressable style={styles.link} onPress={() => router.push('/(auth)/connect')}>
          <Text style={styles.linkText}>Change laptop address</Text>
        </Pressable>
      </View>
    );
  }

  if (mode === 'scan') {
    if (!permission) return <View style={frame} />;
    if (!permission.granted) {
      return (
        <View style={frame}>
          <View style={styles.body}>
            <View style={styles.head}>
              <Text style={styles.title}>Camera access</Text>
              <Text style={styles.subtitle}>
                Tether needs the camera to read the pairing QR code. It&apos;s used for nothing else.
              </Text>
            </View>
            <View style={styles.actions}>
              <Button label="Grant camera access" onPress={requestPermission} />
              <Button label="Back" variant="ghost" onPress={() => setMode('choose')} />
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={frame}>
        <View style={styles.body}>
          <Text style={styles.eyebrow}>Point at the QR code</Text>
          {/* Bordered frame around the viewfinder: it marks the scan target
              and keeps the camera feed from bleeding into the dark ground. */}
          <View style={styles.cameraFrame}>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Back" variant="secondary" onPress={() => setMode('choose')} />
        </View>
      </View>
    );
  }

  return (
    <View style={frame}>
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.title}>Enter pairing code</Text>
          <Text style={styles.subtitle}>The code is shown under the QR on the laptop&apos;s pairing page.</Text>
        </View>

        <View style={styles.fields}>
          <Input
            label="Pairing code"
            placeholder="Paste the code"
            autoCapitalize="none"
            autoCorrect={false}
            value={token}
            onChangeText={(v) => {
              setToken(v);
              if (error) setError(null);
            }}
            error={error}
          />
          <Input
            label="Name this phone"
            placeholder="My Phone"
            value={deviceName}
            onChangeText={setDeviceName}
            hint="Shown in the Devices tab, so you can revoke it later."
          />
        </View>

        <View style={styles.actions}>
          <Button
            label={submitting ? 'Pairing…' : 'Pair'}
            onPress={() => submitPairing(token.trim())}
            busy={submitting}
            disabled={!token.trim()}
          />
          <Button label="Back" variant="ghost" onPress={() => setMode('choose')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg, gap: space.xl },
  head: { gap: space.sm },
  eyebrow: { ...type.label, color: color.signal },
  title: type.display,
  subtitle: type.caption,
  fields: { gap: space.md },
  actions: { gap: space.sm },
  cameraFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    overflow: 'hidden',
    backgroundColor: color.surface,
  },
  camera: { flex: 1 },
  error: { ...type.caption, color: color.danger },
  link: { alignItems: 'center', paddingVertical: space.md },
  linkText: { ...type.caption, color: color.textDim, textDecorationLine: 'underline' },
});
