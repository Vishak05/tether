import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listDevices, revokeDevice } from '../../src/api/devices';
import { getApiErrorMessage } from '../../src/api/errors';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Screen } from '../../src/components/ui/Screen';
import { color, space, type } from '../../src/theme';
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

  const count = data?.devices.length ?? 0;

  return (
    <Screen
      title="Devices"
      subtitle={count ? `${count} paired` : undefined}
      scroll={false}
    >
      <FlatList
        data={data?.devices ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={color.signal}
            colors={[color.signal]}
            progressBackgroundColor={color.surface}
          />
        }
        ListEmptyComponent={
          <Card>
            <Text style={styles.empty}>
              {isLoading
                ? 'Loading…'
                : isError
                  ? "Couldn't load devices"
                  : 'No phones paired yet'}
            </Text>
            {!isLoading && !isError ? (
              <Text style={styles.emptyHint}>
                Pair one from the laptop&apos;s pairing page to see it here.
              </Text>
            ) : null}
          </Card>
        }
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>
                  Last seen {new Date(item.last_seen).toLocaleString()}
                </Text>
              </View>
              <Button
                label="Revoke"
                variant="danger"
                compact
                busy={revokingId === item.id}
                onPress={() => handleRevoke(item)}
              />
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm, paddingBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  info: { flex: 1, gap: 2 },
  name: type.title,
  meta: type.caption,
  empty: { ...type.body, color: color.textMuted },
  emptyHint: type.caption,
});
