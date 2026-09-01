import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '../../src/auth/AuthContext';
import { color, space, type } from '../../src/theme';

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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.signal,
        tabBarInactiveTintColor: color.textMuted,
        // No icon set is installed (@expo/vector-icons is a native dependency
        // and would force a rebuild), so the bar is typographic: wide-tracked
        // uppercase labels, which suits the instrument register anyway.
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { ...type.label, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopColor: color.line,
          borderTopWidth: 1,
          paddingTop: space.sm,
          height: 64,
        },
        tabBarItemStyle: { paddingVertical: space.xs },
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="files" options={{ title: 'Files' }} />
      <Tabs.Screen name="devices" options={{ title: 'Devices' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
