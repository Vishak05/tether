import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { revokeSelf } from '../../src/api/auth';
import { getApiErrorMessage } from '../../src/api/errors';
import { fetchBondedDevices, fetchProximity, updateProximity } from '../../src/api/proximity';
import { useAuth } from '../../src/auth/AuthContext';
import { Badge } from '../../src/components/ui/Badge';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Button } from '../../src/components/ui/Button';
import { Card, Divider } from '../../src/components/ui/Card';
import { Screen } from '../../src/components/ui/Screen';
import { color, space, type } from '../../src/theme';
import type { BondedDevice } from '../../src/types/api';
import { proximityStatusLine } from '../../src/utils/proximityStatus';

export default function SettingsScreen() {
  const { baseUrl, logout } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
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
    setSheetOpen(true);
    setPicking(true);
    setBonded(null);
    try {
      const { devices } = await fetchBondedDevices();
      setBonded(devices);
    } catch (err) {
      setSheetOpen(false);
      Alert.alert("Couldn't list devices", getApiErrorMessage(err));
    } finally {
      setPicking(false);
    }
  };

  const handlePick = (device: BondedDevice) => {
    setSheetOpen(false);
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

  const statusLine = proximityStatusLine(state);
  const lockDelaySecs = state ? state.poll_interval_secs * state.miss_threshold : 0;

  // Mirrors the status line's own logic: the countdown is only meaningful
  // while armed, so the badge tracks the same three states it does.
  const tone = !state?.enabled
    ? 'idle'
    : state?.last_error
      ? 'danger'
      : state?.present
        ? 'live'
        : 'warn';

  return (
    <Screen title="Settings">
      <Card label="Connection">
        <Text style={styles.value}>{baseUrl}</Text>
        <Text style={styles.hint}>The address this phone reaches the agent on.</Text>
        <Divider />
        <Button
          label="Change address"
          variant="secondary"
          onPress={() => router.push('/(auth)/connect')}
        />
      </Card>

      <Card label="Proximity auto-lock" labelRight={state?.enabled ? 'On' : 'Off'}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={styles.hint}>
              Your laptop watches for your phone over Bluetooth and locks itself when it goes out
              of range. Runs on the laptop — works with this app closed.
            </Text>
          </View>
          <Switch
            value={state?.enabled ?? false}
            onValueChange={handleToggle}
            disabled={!state || mutation.isPending}
            trackColor={{ false: color.line, true: color.signalDeep }}
            thumbColor={state?.enabled ? color.signal : color.textMuted}
          />
        </View>

        <Divider />

        <View style={styles.statusRow}>
          <View style={styles.statusCopy}>
            <Text style={styles.label}>Watching for</Text>
            <Text style={styles.value} numberOfLines={1}>
              {state?.target_name ?? state?.target_mac ?? 'No device selected'}
            </Text>
          </View>
          <Badge label={statusLine} tone={tone} pulse={tone === 'live'} />
        </View>

        {state?.enabled ? (
          <Text style={styles.hint}>Locks after about {lockDelaySecs}s out of range.</Text>
        ) : null}
        {state && !state.running ? (
          <Text style={styles.warning}>The laptop&apos;s auto-lock service isn&apos;t running.</Text>
        ) : null}

        <Button label="Choose device" variant="secondary" onPress={handleOpenPicker} />
      </Card>

      <Card label="Session">
        <Button label={busy ? 'Logging out…' : 'Log out'} variant="danger" busy={busy} onPress={handleLogout} />
      </Card>

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Paired devices">
        {picking ? (
          <ActivityIndicator style={styles.sheetLoading} color={color.signal} />
        ) : (
          <FlatList
            data={bonded ?? []}
            keyExtractor={(item) => item.mac}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetList}
            ListEmptyComponent={
              <Text style={styles.hint}>
                No paired devices found. Pair your phone with this laptop in Windows Bluetooth
                settings first — that&apos;s separate from Tether&apos;s pairing code.
              </Text>
            }
            ItemSeparatorComponent={Divider}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.sheetRow, pressed ? styles.sheetRowPressed : null]}
                onPress={() => handlePick(item)}
              >
                <Text style={styles.value} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.hint}>{item.mac}</Text>
              </Pressable>
            )}
          />
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: type.label,
  value: { ...type.body, color: color.text, fontWeight: '600' },
  hint: type.caption,
  warning: { ...type.caption, color: color.danger },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  toggleCopy: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  statusCopy: { flex: 1, gap: space.xs },
  sheetLoading: { paddingVertical: space.xl },
  sheetList: { paddingVertical: space.sm },
  sheetRow: { paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: 12, gap: 2 },
  sheetRowPressed: { backgroundColor: color.surfaceRaised },
});
