import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { revokeSelf } from '../../src/api/auth';
import { getApiErrorMessage } from '../../src/api/errors';
import { fetchBondedDevices, fetchProximity, updateProximity } from '../../src/api/proximity';
import { useAuth } from '../../src/auth/AuthContext';
import type { BondedDevice } from '../../src/types/api';

export default function SettingsScreen() {
  const { baseUrl, logout } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [bonded, setBonded] = useState<BondedDevice[] | null>(null);

  // Polled rather than fetched once: `present` and `consecutive_misses` are
  // live state from the laptop's probe loop, so the screen should track them
  // while it's open.
  const proximity = useQuery({
    queryKey: ['proximity'],
    queryFn: fetchProximity,
    refetchInterval: 10_000,
  });

  const mutation = useMutation({
    mutationFn: updateProximity,
    onSuccess: (data) => queryClient.setQueryData(['proximity'], data),
    onError: (err) => Alert.alert("Couldn't update auto-lock", getApiErrorMessage(err)),
  });

  const state = proximity.data;

  const handleToggle = (value: boolean) => {
    if (value && !state?.target_mac) {
      Alert.alert('Pick a device first', 'Choose which Bluetooth device the laptop should watch for before turning this on.');
      return;
    }
    mutation.mutate({ enabled: value });
  };

  const handleOpenPicker = async () => {
    setPicking(true);
    setBonded(null);
    try {
      const { devices } = await fetchBondedDevices();
      setBonded(devices);
    } catch (err) {
      Alert.alert("Couldn't list devices", getApiErrorMessage(err));
    } finally {
      setPicking(false);
    }
  };

  const handlePick = (device: BondedDevice) => {
    setBonded(null);
    mutation.mutate({ target_mac: device.mac, target_name: device.name });
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

  const statusLine = (() => {
    if (!state) return 'Loading…';
    if (!state.enabled) return 'Off';
    if (state.last_error) return `Can't check right now — ${state.last_error}`;
    if (state.present === null) return 'Waiting for the first check…';
    if (state.present) return 'Phone detected nearby';
    return `Phone not detected (${state.consecutive_misses} of ${state.miss_threshold})`;
  })();

  const lockDelaySecs = state ? state.poll_interval_secs * state.miss_threshold : 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
            <Text style={styles.hint}>
              Your laptop watches for your phone over Bluetooth and locks itself when it goes
              out of range. Runs on the laptop — works with this app closed.
            </Text>
          </View>
          <Switch
            value={state?.enabled ?? false}
            onValueChange={handleToggle}
            disabled={!state || mutation.isPending}
          />
        </View>

        <Text style={styles.value}>{state?.target_name ?? state?.target_mac ?? 'No device selected'}</Text>
        <Text style={styles.hint}>{statusLine}</Text>
        {state?.enabled ? (
          <Text style={styles.hint}>Locks after about {lockDelaySecs}s out of range.</Text>
        ) : null}
        {state && !state.running ? (
          <Text style={[styles.hint, styles.dangerText]}>
            The laptop&apos;s auto-lock service isn&apos;t running.
          </Text>
        ) : null}

        <View style={styles.buttonRow}>
          <Pressable style={styles.linkButton} onPress={handleOpenPicker} disabled={picking}>
            <Text style={styles.linkText}>{picking ? 'Loading…' : 'Choose device'}</Text>
          </Pressable>
        </View>

        {picking ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}

        {bonded ? (
          <FlatList
            style={styles.scanList}
            data={bonded}
            keyExtractor={(item) => item.mac}
            ListEmptyComponent={
              <Text style={styles.hint}>
                No paired devices found. Pair your phone with this laptop in Windows Bluetooth
                settings first.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.scanRow} onPress={() => handlePick(item)}>
                <Text style={styles.scanName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.hint}>{item.mac}</Text>
              </Pressable>
            )}
          />
        ) : null}
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout} disabled={busy}>
        <Text style={styles.logoutText}>{busy ? 'Logging out…' : 'Log out'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16, gap: 24 },
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
