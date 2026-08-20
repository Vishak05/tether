import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getApiErrorMessage } from '../../src/api/errors';
import { getOutboxDownloadTarget, listInbox, listOutbox, uploadToInbox } from '../../src/api/files';
import type { FileEntry } from '../../src/types/api';
import { saveFileToDownloads } from '../../src/utils/saveToDownloads';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({ entry, action }: { entry: FileEntry; action?: { label: string; onPress: () => void; busy: boolean } }) {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
        <Text style={styles.muted}>{formatSize(entry.size_bytes)}</Text>
      </View>
      {action ? (
        <Pressable style={styles.actionButton} disabled={action.busy} onPress={action.onPress}>
          <Text style={styles.actionText}>{action.busy ? '…' : action.label}</Text>
        </Pressable>
      ) : null}
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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Pressable style={styles.uploadButton} onPress={handleUpload} disabled={uploading}>
        <Text style={styles.uploadText}>{uploading ? 'Uploading…' : 'Send a file to laptop'}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>From your laptop</Text>
      <Text style={styles.hint}>Files dropped in the laptop's "Tether Outbox" folder</Text>
      {outbox.isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : outbox.isError ? (
        <Text style={styles.error}>Couldn't load the outbox</Text>
      ) : outbox.data!.files.length === 0 ? (
        <Text style={styles.muted}>Nothing here yet</Text>
      ) : (
        outbox.data!.files.map((entry) => (
          <FileRow
            key={entry.id}
            entry={entry}
            action={{ label: 'Get', onPress: () => handleDownload(entry), busy: busyId === entry.id }}
          />
        ))
      )}

      <Text style={styles.sectionTitle}>Sent to your laptop</Text>
      <Text style={styles.hint}>Lands in the laptop's "Tether Inbox" folder</Text>
      {inbox.isLoading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : inbox.isError ? (
        <Text style={styles.error}>Couldn't load the inbox</Text>
      ) : inbox.data!.files.length === 0 ? (
        <Text style={styles.muted}>Nothing sent yet</Text>
      ) : (
        inbox.data!.files.map((entry) => <FileRow key={entry.id} entry={entry} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  uploadButton: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 8 },
  uploadText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16 },
  hint: { color: '#666', fontSize: 12, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  info: { flex: 1, marginRight: 12 },
  name: { fontSize: 15, fontWeight: '600' },
  muted: { color: '#666', marginTop: 2, fontSize: 13 },
  error: { color: '#c0392b' },
  actionButton: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  actionText: { color: '#fff', fontWeight: '600' },
});
