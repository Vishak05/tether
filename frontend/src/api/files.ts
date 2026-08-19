import client, { getApiBaseUrl } from './client';
import { getSession } from '../auth/secureStore';
import type { FileEntry, FileListResponse } from '../types/api';

export async function listOutbox(): Promise<FileListResponse> {
  const { data } = await client.get<FileListResponse>('/files/outbox');
  return data;
}

export async function listInbox(): Promise<FileListResponse> {
  const { data } = await client.get<FileListResponse>('/files/inbox');
  return data;
}

// expo-file-system's downloadAsync wants a plain URL + headers, not an axios
// request, so this builds those separately rather than going through `client`.
export async function getOutboxDownloadTarget(fileId: string): Promise<{ url: string; headers: Record<string, string> }> {
  const session = await getSession();
  return {
    url: `${getApiBaseUrl()}/files/outbox/${encodeURIComponent(fileId)}/download`,
    headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {},
  };
}

export async function uploadToInbox(file: { uri: string; name: string; mimeType?: string | null }): Promise<FileEntry> {
  const form = new FormData();
  // React Native's FormData expects this exact shape for a file part.
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || 'application/octet-stream',
  } as unknown as Blob);

  const { data } = await client.post<FileEntry>('/files/inbox', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
