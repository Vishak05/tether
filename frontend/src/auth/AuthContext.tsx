import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { setApiBaseUrl, setOnAuthFailure } from '../api/client';
import {
  clearSession,
  getBaseUrl,
  getSession,
  setBaseUrl as persistBaseUrl,
  setSession as persistSession,
  StoredSession,
} from './secureStore';

interface AuthContextValue {
  isLoading: boolean;
  baseUrl: string | null;
  session: StoredSession | null;
  connect: (url: string) => Promise<void>;
  completePairing: (session: StoredSession) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [baseUrl, setBaseUrlState] = useState<string | null>(null);
  const [session, setSessionState] = useState<StoredSession | null>(null);

  useEffect(() => {
    setOnAuthFailure(() => {
      setSessionState(null);
    });

    (async () => {
      const [storedUrl, storedSession] = await Promise.all([getBaseUrl(), getSession()]);
      if (storedUrl) {
        setApiBaseUrl(storedUrl);
        setBaseUrlState(storedUrl);
      }
      setSessionState(storedSession);
      setIsLoading(false);
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      baseUrl,
      session,
      connect: async (url: string) => {
        await persistBaseUrl(url);
        setApiBaseUrl(url);
        setBaseUrlState(url);
      },
      completePairing: async (newSession: StoredSession) => {
        await persistSession(newSession);
        setSessionState(newSession);
      },
      logout: async () => {
        await clearSession();
        setSessionState(null);
      },
    }),
    [isLoading, baseUrl, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
