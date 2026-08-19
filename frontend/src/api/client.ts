import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { clearSession, getSession, setAccessToken } from '../auth/secureStore';
import type { TokenResponse } from '../types/api';

const client: AxiosInstance = axios.create({ timeout: 15000 });

// Called once at startup (and whenever Settings changes the laptop address).
export function setApiBaseUrl(baseUrl: string): void {
  client.defaults.baseURL = baseUrl.replace(/\/+$/, '');
}

// Exported for anything that needs a fully-qualified URL rather than going
// through the axios instance — e.g. expo-file-system's downloadAsync, which
// takes a plain URL + headers rather than an axios request.
export function getApiBaseUrl(): string {
  return client.defaults.baseURL ?? '';
}

// Invoked when the refresh token itself is rejected (expired/device revoked) —
// AuthContext registers this to clear stored session state and route back to Connect.
let onAuthFailure: (() => void) | null = null;
export function setOnAuthFailure(handler: () => void): void {
  onAuthFailure = handler;
}

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  // /auth/pair and /auth/refresh don't take a Bearer token; everything else does.
  if (config.url === '/auth/pair' || config.url === '/auth/refresh') return config;
  const session = await getSession();
  if (session) {
    config.headers.set('Authorization', `Bearer ${session.accessToken}`);
  }
  return config;
});

// Single in-flight refresh shared across concurrent 401s (and the WS hook's
// own reconnect-time refresh, via refreshAccessToken below) so we never fire
// more than one /auth/refresh call at a time.
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    const { data } = await axios.post<TokenResponse>(
      `${client.defaults.baseURL}/auth/refresh`,
      { refresh_token: session.refreshToken },
    );
    await setAccessToken(data.access_token);
    return data.access_token;
  } catch {
    return null;
  }
}

// Exported for src/hooks/useLiveStatus.ts, which needs a guaranteed-fresh
// access token when (re)establishing the WebSocket connection — the socket
// handshake is verified once server-side, so reconnecting with a token that
// already expired while the app was backgrounded would otherwise loop.
export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retried &&
      originalRequest.url !== '/auth/refresh'
    ) {
      originalRequest._retried = true;

      const newAccessToken = await refreshAccessToken();

      if (newAccessToken) {
        originalRequest.headers.set('Authorization', `Bearer ${newAccessToken}`);
        return client(originalRequest);
      }

      await clearSession();
      onAuthFailure?.();
    }

    return Promise.reject(error);
  },
);

export default client;
