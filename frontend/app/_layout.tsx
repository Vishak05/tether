import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../src/auth/AuthContext';
import { color } from '../src/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* Light glyphs: every surface in the app sits on the dark ground. */}
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              // Without this the navigator flashes white between screens,
              // which is very visible against a dark app.
              contentStyle: { backgroundColor: color.bg },
            }}
          />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
