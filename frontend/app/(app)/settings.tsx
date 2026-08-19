import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { revokeSelf } from '../../src/api/auth';
import { getApiErrorMessage } from '../../src/api/errors';
import { useAuth } from '../../src/auth/AuthContext';
import {
  clearAutoLockAnchor,
  getAutoLockAnchor,
  getAutoLockEnabled,
  setAutoLockAnchor,
  setAutoLockEnabled,
  type AutoLockAnchor,
} from '../../src/auth/secureStore';
import { requestBlePermissions, scanForNearbyDevices, type NearbyDevice } from '../../src/ble/manager';

export default function SettingsScreen() {
  const { baseUrl, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const [autoLockEnabled, setAutoLockEnabledState] = useState(false);
  const [anchor, setAnchor] = useState<AutoLockAnchor | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<NearbyDevice[] | null>(null);

  useEffect(() => {
    (async () => {
      const [enabled, storedAnchor] = await Promise.all([getAutoLockEnabled(), getAutoLockAnchor()]);
      setAutoLockEnabledState(enabled);
      setAnchor(storedAnchor);
    })();
  }, []);

  const handleToggle = async (value: boolean) => {
    if (value && !anchor) {
      Alert.alert('Pick a device first', 'Scan for and select a nearby Bluetooth device to use as the presence anchor before enabling.');
      return;
    }
    setAutoLockEnabledState(value);
    await setAutoLockEnabled(value);
  };

  const handleScan = async () => {
    const granted = await requestBlePermissions();
    if (!granted) {
      Alert.alert('Bluetooth permission needed', 'Tether needs Bluetooth permission to scan for nearby devices.');
      return;
    }
    setScanning(true);
    setScanResults(null);
    try {
      const results = await scanForNearbyDevices();
      setScanResults(results);
    } catch (err) {
      Alert.alert('Scan failed', getApiErrorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const handlePickAnchor = async (device: NearbyDevice) => {
    const picked = { id: device.id, name: device.name };
    await setAutoLockAnchor(picked);
    setAnchor(picked);
    setScanResults(null);
  };

  const handleClearAnchor = async () => {
    await clearAutoLockAnchor();
    await setAutoLockEnabled(false);
    setAnchor(null);
    setAutoLockEnabledState(false);
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await revokeSelf();
    } catch (err) {
      // Still log out locally even if the server call fails (e.g. laptop unreachable) —
      // a dangling server-side token isn't worth blocking the user's own device.
      Alert.alert('Heads up', `Couldn't reach the laptop to revoke remotely: ${getApiErrorMessage(err)}`);
    } finally {
      await logout();
      setBusy(false);
      router.replace('/(auth)/connect');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Laptop address</Text>
        <Text style={styles.value}>{baseUrl}</Text>
        <Pressable style={styles.linkButton} onPress={() => router.push('/(auth)/connect')}>
          <Text style={styles.linkText}>Change address</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Proximity Auto-Lock</Text>
            <Text style={styles.hint}>Locks the laptop when your chosen device is no longer nearby. Only works while this app is open.</Text>
          </View>
          <Switch value={autoLockEnabled} onValueChange={handleToggle} />
        </View>

        <Text style={styles.value}>{anchor ? anchor.name : 'No device selected'}</Text>

        <View style={styles.buttonRow}>
          <Pressable style={styles.linkButton} onPress={handleScan} disabled={scanning}>
            <Text style={styles.linkText}>{scanning ? 'Scanning…' : 'Scan for nearby devices'}</Text>
          </Pressable>
          {anchor ? (
            <Pressable style={styles.linkButton} onPress={handleClearAnchor}>
              <Text style={[styles.linkText, styles.dangerText]}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {scanning ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}

        {scanResults ? (
          <FlatList
            style={styles.scanList}
            data={scanResults}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.hint}>No devices found — try again closer to the device.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.scanRow} onPress={() => handlePickAnchor(item)}>
                <Text style={styles.scanName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.hint}>{item.rssi != null ? `${item.rssi} dBm` : ''}</Text>
              </Pressable>
            )}
          />
        ) : null}
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout} disabled={busy}>
        <Text style={styles.logoutText}>{busy ? 'Logging out…' : 'Log out'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 24 },
  section: { backgroundColor: '#f3f4f6', borderRadius: 10, padding: 16, gap: 6 },
  label: { fontSize: 13, color: '#666', textTransform: 'uppercase' },
  value: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, color: '#666', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttonRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  linkButton: {},
  linkText: { color: '#2563eb', fontWeight: '600' },
  dangerText: { color: '#dc2626' },
  scanList: { marginTop: 8, maxHeight: 180 },
  scanRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  scanName: { fontSize: 14, fontWeight: '600' },
  logoutButton: { backgroundColor: '#dc2626', borderRadius: 10, padding: 14, alignItems: 'center' },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
