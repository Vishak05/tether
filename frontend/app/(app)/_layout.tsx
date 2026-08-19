import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '../../src/auth/AuthContext';
import { useProximityAutoLock } from '../../src/hooks/useProximityAutoLock';

export default function AppLayout() {
  const { session } = useAuth();

  // Runs for as long as the user is anywhere in the (app) group — foreground-only
  // by design, see docs/phaseAutoLock_summary.md.
  useProximityAutoLock();

  // Covers the case where a background 401->refresh cycle failed (device
  // revoked / refresh token expired) while the user was already inside the app.
  if (!session) return <Redirect href="/(auth)/pair" />;

  return (
    <Tabs screenOptions={{ headerTitleAlign: 'center' }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="files" options={{ title: 'Files' }} />
      <Tabs.Screen name="devices" options={{ title: 'Devices' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
