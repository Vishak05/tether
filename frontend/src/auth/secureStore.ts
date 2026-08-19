import * as SecureStore from 'expo-secure-store';

// Thin wrapper so the rest of the app deals with named keys, not raw strings.
const KEYS = {
  baseUrl: 'tether.base_url',
  accessToken: 'tether.access_token',
  refreshToken: 'tether.refresh_token',
  deviceId: 'tether.device_id',
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
