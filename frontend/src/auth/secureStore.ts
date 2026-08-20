import * as SecureStore from 'expo-secure-store';

// Thin wrapper so the rest of the app deals with named keys, not raw strings.
const KEYS = {
  baseUrl: 'tether.base_url',
  accessToken: 'tether.access_token',
  refreshToken: 'tether.refresh_token',
  deviceId: 'tether.device_id',
  autoLockEnabled: 'tether.auto_lock_enabled',
  autoLockAnchorId: 'tether.auto_lock_anchor_id',
  autoLockAnchorName: 'tether.auto_lock_anchor_name',
  downloadsDirectoryUri: 'tether.downloads_directory_uri',
} as const;

export async function getBaseUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.baseUrl);
}

export async function setBaseUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.baseUrl, url);
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}

export async function getSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, deviceId] = await Promise.all([
    SecureStore.getItemAsync(KEYS.accessToken),
    SecureStore.getItemAsync(KEYS.refreshToken),
    SecureStore.getItemAsync(KEYS.deviceId),
  ]);
  if (!accessToken || !refreshToken || !deviceId) return null;
  return { accessToken, refreshToken, deviceId };
}

export async function setSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.accessToken, session.accessToken),
    SecureStore.setItemAsync(KEYS.refreshToken, session.refreshToken),
    SecureStore.setItemAsync(KEYS.deviceId, session.deviceId),
  ]);
}

export async function setAccessToken(accessToken: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.accessToken, accessToken);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.accessToken),
    SecureStore.deleteItemAsync(KEYS.refreshToken),
    SecureStore.deleteItemAsync(KEYS.deviceId),
  ]);
}

// ── Proximity auto-lock ─────────────────────────────────────────────────────

export interface AutoLockAnchor {
  id: string;
  name: string;
}

export async function getAutoLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEYS.autoLockEnabled)) === 'true';
}

export async function setAutoLockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEYS.autoLockEnabled, enabled ? 'true' : 'false');
}

export async function getAutoLockAnchor(): Promise<AutoLockAnchor | null> {
  const [id, name] = await Promise.all([
    SecureStore.getItemAsync(KEYS.autoLockAnchorId),
    SecureStore.getItemAsync(KEYS.autoLockAnchorName),
  ]);
  if (!id) return null;
  return { id, name: name || id };
}

export async function setAutoLockAnchor(anchor: AutoLockAnchor): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.autoLockAnchorId, anchor.id),
    SecureStore.setItemAsync(KEYS.autoLockAnchorName, anchor.name),
  ]);
}

export async function clearAutoLockAnchor(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.autoLockAnchorId),
    SecureStore.deleteItemAsync(KEYS.autoLockAnchorName),
  ]);
}

// ── Downloads folder (Android Storage Access Framework) ────────────────────

export async function getDownloadsDirectoryUri(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.downloadsDirectoryUri);
}

export async function setDownloadsDirectoryUri(uri: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.downloadsDirectoryUri, uri);
}

export async function clearDownloadsDirectoryUri(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.downloadsDirectoryUri);
}
