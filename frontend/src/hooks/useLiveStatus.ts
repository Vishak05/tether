import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { refreshAccessToken } from '../api/client';
import { fetchStatus } from '../api/status';
import { useAuth } from '../auth/AuthContext';
import { getSession } from '../auth/secureStore';
import type { HeartbeatMessage, StatusResponse } from '../types/api';

const RECONNECT_DELAY_MS = 3000;

function toWsUrl(baseUrl: string, token: string): string {
  const wsBase = baseUrl.replace(/^http/, 'ws');
  return `${wsBase}/ws/status?token=${encodeURIComponent(token)}`;
}

/**
 * Replaces the old GET /status polling loop with the Phase 4 WebSocket
 * heartbeat. The socket only carries the fields that change tick to tick
 * (battery/active_window/locked) — laptop_id/platform/version/uptime come
 * from one REST call on mount and are merged with the live fields below.
 */
export function useLiveStatus() {
  const { baseUrl, session } = useAuth();
  const [heartbeat, setHeartbeat] = useState<HeartbeatMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meta = useQuery({
    queryKey: ['status-meta'],
    queryFn: fetchStatus,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!baseUrl || !session) return;

    let cancelled = false;

    async function connect() {
      if (cancelled) return;

      // Always read the freshest token from storage — AuthContext's in-memory
      // `session` isn't updated by the axios client's silent 401 refresh, so
      // using it directly here could reconnect with a stale/expired token.
      const stored = await getSession();
      if (!stored || cancelled) return;

      const ws = new WebSocket(toWsUrl(baseUrl!, stored.accessToken));
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as HeartbeatMessage;
          if (data.type === 'heartbeat') setHeartbeat(data);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = async (event) => {
        if (cancelled) return;
        setConnected(false);

        // 4401 = unauthorized (expired/invalid token or revoked device).
        // Refresh once before retrying — a device that's actually been
        // revoked will just fail refresh too and the reconnect loop below
        // will keep retrying harmlessly with the (still-invalid) result.
        if (event.code === 4401) {
          await refreshAccessToken();
        }

        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [baseUrl, session]);

  const status: StatusResponse | undefined = meta.data
    ? {
        ...meta.data,
        state: heartbeat
          ? {
              battery: heartbeat.battery,
              active_window: heartbeat.active_window,
              locked: heartbeat.locked,
              system: heartbeat.system,
              idle_secs: heartbeat.idle_secs,
              volume: heartbeat.volume,
              brightness: heartbeat.brightness,
            }
          : meta.data.state,
      }
    : undefined;

  return {
    status,
    isLoading: meta.isLoading,
    isError: meta.isError && !connected,
    connected,
  };
}
