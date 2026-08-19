import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { revokeSelf } from '../../src/api/auth';
import { getApiErrorMessage } from '../../src/api/errors';
import { useAuth } from '../../src/auth/AuthContext';

export default function SettingsScreen() {
  const { baseUrl, logout } = useAuth();
  const [busy, setBusy] = useState(false);

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
  linkButton: { marginTop: 8 },
  linkText: { color: '#2563eb', fontWeight: '600' },
  logoutButton: { backgroundColor: '#dc2626', borderRadius: 10, padding: 14, alignItems: 'center' },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
