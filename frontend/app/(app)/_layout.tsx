import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '../../src/auth/AuthContext';

export default function AppLayout() {
  const { session } = useAuth();

  // Covers the case where a background 401->refresh cycle failed (device
  // revoked / refresh token expired) while the user was already inside the app.
  if (!session) return <Redirect href="/(auth)/pair" />;

  return (
    <Tabs screenOptions={{ headerTitleAlign: 'center' }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="devices" options={{ title: 'Devices' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
