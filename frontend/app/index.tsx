import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '../src/auth/AuthContext';
import { color } from '../src/theme';

// Root gate: routes to the right flow based on stored connection/session state.
export default function Index() {
  const { isLoading, baseUrl, session } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={color.signal} />
      </View>
    );
  }

  if (!baseUrl) return <Redirect href="/(auth)/connect" />;
  if (!session) return <Redirect href="/(auth)/pair" />;
  return <Redirect href="/(app)" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg },
});
