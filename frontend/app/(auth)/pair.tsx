import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { pairDevice } from '../../src/api/auth';
import { getApiErrorMessage } from '../../src/api/errors';
import { useAuth } from '../../src/auth/AuthContext';
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
      <View style={styles.container}>
        <Text style={styles.title}>Pair with your laptop</Text>
        <Text style={styles.subtitle}>
          Open the pairing page on your laptop, then scan the QR code or enter the code shown.
        </Text>
        <Pressable style={styles.button} onPress={() => setMode('scan')}>
          <Text style={styles.buttonText}>Scan QR code</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => setMode('manual')}>
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Enter code manually</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => router.push('/(auth)/connect')}>
          <Text style={styles.linkText}>Change laptop address</Text>
        </Pressable>
      </View>
    );
  }

  if (mode === 'scan') {
    if (!permission) return <View style={styles.container} />;
    if (!permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.subtitle}>Camera access is needed to scan the pairing QR code.</Text>
          <Pressable style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant camera access</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => setMode('choose')}>
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter pairing code</Text>
      <TextInput
        style={styles.input}
        placeholder="Pairing token"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        value={token}
        onChangeText={setToken}
      />
      <TextInput
        style={styles.input}
        placeholder="This device's name"
        placeholderTextColor="#888"
        value={deviceName}
        onChangeText={setDeviceName}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={styles.button}
        disabled={submitting || !token.trim()}
        onPress={() => submitPairing(token.trim())}
      >
        <Text style={styles.buttonText}>{submitting ? 'Pairing…' : 'Pair'}</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => setMode('choose')}>
        <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 16 },
  camera: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: '#c0392b' },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#2563eb' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: '#2563eb' },
  linkButton: { alignItems: 'center', marginTop: 8 },
  linkText: { color: '#666', fontSize: 14, textDecorationLine: 'underline' },
});
