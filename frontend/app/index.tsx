import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../src/auth/AuthContext';

// Root gate: routes to the right flow based on stored connection/session state.
export default function Index() {
  const { isLoading, baseUrl, session } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!baseUrl) return <Redirect href="/(auth)/connect" />;
  if (!session) return <Redirect href="/(auth)/pair" />;
  return <Redirect href="/(app)" />;
}
