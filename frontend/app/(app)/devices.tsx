import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { listDevices, revokeDevice } from '../../src/api/devices';
import { getApiErrorMessage } from '../../src/api/errors';
import type { Device } from '../../src/types/api';

export default function DevicesScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
  });
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleRevoke = (device: Device) => {
    Alert.alert('Revoke device', `Remove "${device.name}"'s access?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setRevokingId(device.id);
          try {
            await revokeDevice(device.id);
            await queryClient.invalidateQueries({ queryKey: ['devices'] });
          } catch (err) {
            Alert.alert('Revoke failed', getApiErrorMessage(err));
          } finally {
            setRevokingId(null);
          }
        },
      },
    ]);
  };

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={data?.devices ?? []}
      keyExtractor={(item) => item.id}
      onRefresh={refetch}
      refreshing={isRefetching}
      ListEmptyComponent={
        <Text style={styles.muted}>
          {isLoading ? 'Loading…' : isError ? "Couldn't load devices" : 'No paired devices'}
        </Text>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.muted}>Last seen {new Date(item.last_seen).toLocaleString()}</Text>
          </View>
          <Pressable
            style={styles.revokeButton}
            disabled={revokingId === item.id}
            onPress={() => handleRevoke(item)}
          >
            <Text style={styles.revokeText}>Revoke</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 14,
  },
  info: { flex: 1, marginRight: 12 },
  name: { fontSize: 16, fontWeight: '600' },
  muted: { color: '#666', marginTop: 2 },
  revokeButton: { backgroundColor: '#dc2626', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  revokeText: { color: '#fff', fontWeight: '600' },
});
