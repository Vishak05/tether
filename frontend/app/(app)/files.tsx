import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getApiErrorMessage } from '../../src/api/errors';
import { getOutboxDownloadTarget, listInbox, listOutbox, uploadToInbox } from '../../src/api/files';
import { Button } from '../../src/components/ui/Button';
import { Card, Divider } from '../../src/components/ui/Card';
import { Screen } from '../../src/components/ui/Screen';
import { color, space, type } from '../../src/theme';
import type { FileEntry } from '../../src/types/api';
import { saveFileToDownloads } from '../../src/utils/saveToDownloads';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({
  entry,
  action,
  last,
}: {
  entry: FileEntry;
  action?: { label: string; onPress: () => void; busy: boolean };
  last: boolean;
}) {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={styles.meta}>{formatSize(entry.size_bytes)}</Text>
        </View>
        {action ? (
          <Button
            label={action.label}
            variant="secondary"
            compact
            busy={action.busy}
            onPress={action.onPress}
          />
        ) : null}
      </View>
      {/* Rules between rows only, never trailing — a divider under the last
          row reads as a section that lost its content. */}
      {last ? null : <Divider />}
    </View>
  );
}

export default function FilesScreen() {
  const queryClient = useQueryClient();
  const outbox = useQuery({ queryKey: ['files', 'outbox'], queryFn: listOutbox });
  const inbox = useQuery({ queryKey: ['files', 'inbox'], queryFn: listInbox });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // React Query has no built-in "refetch when this tab regains focus" for
  // React Native (that's a web-only default) — without this, switching to
  // another tab and back showed stale data until the whole app was reloaded.
  useFocusEffect(
    useCallback(() => {
      outbox.refetch();
      inbox.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const refreshing = outbox.isRefetching || inbox.isRefetching;
  const handleRefresh = () => {
    outbox.refetch();
    inbox.refetch();
  };

  const handleDownload = async (entry: FileEntry) => {
    setBusyId(entry.id);
    let cacheFile: File | null = null;
    try {
      const target = await getOutboxDownloadTarget(entry.id);
      const destination = new File(Paths.cache, entry.name);
      // The cache copy is always cleaned up in `finally` below, so this
      // destination shouldn't already exist — but guard against a stale
      // leftover from a previous run that got killed mid-download.
      if (destination.exists) destination.delete();
      const task = File.createDownloadTask(target.url, destination, { headers: target.headers });
      cacheFile = await task.downloadAsync();
      if (!cacheFile) throw new Error('Download did not complete');
      await saveFileToDownloads(cacheFile);
      Alert.alert('Downloaded', `${entry.name} saved.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : getApiErrorMessage(err);
      Alert.alert('Download failed', message);
    } finally {
      try {
        cacheFile?.delete();
      } catch {
        // best-effort cleanup of the temp cache copy — not worth surfacing
      }
      setBusyId(null);
    }
  };

  const handleUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync();
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    try {
      await uploadToInbox({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
      await queryClient.invalidateQueries({ queryKey: ['files', 'inbox'] });
    } catch (err) {
      Alert.alert('Upload failed', getApiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const section = (
    q: typeof outbox,
    emptyLabel: string,
    errorLabel: string,
    action?: (entry: FileEntry) => { label: string; onPress: () => void; busy: boolean },
  ) => {
    if (q.isLoading) return <Text style={styles.muted}>Loading…</Text>;
    if (q.isError) return <Text style={styles.error}>{errorLabel}</Text>;
    const files = q.data!.files;
    if (files.length === 0) return <Text style={styles.muted}>{emptyLabel}</Text>;
    return files.map((entry, i) => (
      <FileRow
        key={entry.id}
        entry={entry}
        action={action?.(entry)}
        last={i === files.length - 1}
      />
    ));
  };

  return (
    <Screen title="Files" scroll={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={color.signal}
            colors={[color.signal]}
            progressBackgroundColor={color.surface}
          />
        }
      >
        <Button
          label={uploading ? 'Uploading…' : 'Send a file to laptop'}
          onPress={handleUpload}
          busy={uploading}
        />

        <Card
          label="From your laptop"
          labelRight={outbox.data ? String(outbox.data.files.length) : undefined}
        >
          <Text style={styles.hint}>Anything dropped in the laptop&apos;s Tether Outbox folder.</Text>
          {section(outbox, 'Nothing here yet', "Couldn't load the outbox", (entry) => ({
            label: 'Get',
            onPress: () => handleDownload(entry),
            busy: busyId === entry.id,
          }))}
        </Card>

        <Card
          label="Sent to your laptop"
          labelRight={inbox.data ? String(inbox.data.files.length) : undefined}
        >
          <Text style={styles.hint}>Lands in the laptop&apos;s Tether Inbox folder.</Text>
          {section(inbox, 'Nothing sent yet', "Couldn't load the inbox")}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: space.md, paddingBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  info: { flex: 1, gap: 2 },
  name: { ...type.body, color: color.text, fontWeight: '600' },
  meta: type.caption,
  hint: { ...type.caption, marginBottom: space.xs },
  muted: { ...type.body, color: color.textMuted },
  error: { ...type.body, color: color.danger },
});
