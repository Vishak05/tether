import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '../../src/auth/AuthContext';

export default function AppLayout() {
  const { session } = useAuth();

  // Proximity auto-lock used to be driven from here, which meant it only ran
  // while the app was open. It now lives in the agent, which watches for the
  // phone over Bluetooth and locks the laptop itself — so there's nothing for
  // the app to run. Settings just configures it over HTTP.

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
