import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { refreshAccessToken } from '../../src/api/client';
import { terminalPageUrl } from '../../src/api/terminal';
import { useAuth } from '../../src/auth/AuthContext';
import { getSession } from '../../src/auth/secureStore';
import { Badge, type BadgeTone } from '../../src/components/ui/Badge';
import { color, HIT, space, type } from '../../src/theme';

// Connection states reported by the page (agent/static/terminal/index.html).
const STATE_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  connecting: { label: 'Connecting', tone: 'idle' },
  live: { label: 'Live', tone: 'live' },
  reconnecting: { label: 'Reconnecting', tone: 'warn' },
  auth: { label: 'Signing in', tone: 'idle' },
  idle: { label: 'Disconnected', tone: 'idle' },
  detached: { label: 'Detached', tone: 'idle' },
  ended: { label: 'Ended', tone: 'idle' },
  denied: { label: 'Refused', tone: 'danger' },
  error: { label: 'Error', tone: 'danger' },
};

/** Quotes a string as a JS literal for injection into the page. */
const js = (value: string) => JSON.stringify(value);

/**
 * Full-screen terminal for one tmux session.
 *
 * The terminal itself is a page the agent serves, so this screen is only the
 * frame around it: it hands the page a token, refreshes that token when the
 * page asks, and keeps the page above the keyboard. Lives outside the tab
 * navigator so the terminal gets the whole screen.
 */
export default function SessionScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [token, setToken] = useState<string | null>(null);
  const [connState, setConnState] = useState('connecting');

  // Start from a freshly refreshed token: the stored one is short-lived and
  // may well have expired while the app sat in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fresh = (await refreshAccessToken()) ?? (await getSession())?.accessToken ?? null;
      if (!cancelled) setToken(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!session) return <Redirect href="/(auth)/pair" />;

  const handleMessage = async (event: WebViewMessageEvent) => {
    let msg: { type?: string; state?: string };
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'state' && msg.state) {
      setConnState(msg.state);
    } else if (msg.type === 'need-token') {
      const fresh = await refreshAccessToken();
      if (fresh) {
        webRef.current?.injectJavaScript(`window.tether.setToken(${js(fresh)}); true;`);
      } else {
        // Refresh refused: the device was revoked or its refresh token
        // expired. Nothing on this screen can fix that.
        setConnState('denied');
        Alert.alert('Signed out', 'The laptop no longer accepts this phone. Pair it again to continue.');
        router.back();
      }
    }
  };

  const badge = STATE_BADGE[connState] ?? STATE_BADGE.connecting;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed ? styles.backPressed : null]}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {name}
        </Text>
        <Badge label={badge.label} tone={badge.tone} pulse={connState === 'live'} />
      </View>

      {/* "padding" measures how far the keyboard actually overlaps this view,
          so it's right whether or not Android has already resized the window
          (edge-to-edge builds don't). */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {token && name ? (
          <WebView
            ref={webRef}
            style={styles.web}
            containerStyle={{ backgroundColor: color.bg }}
            source={{ uri: terminalPageUrl(name) }}
            injectedJavaScriptBeforeContentLoaded={`window.TETHER_TOKEN = ${js(token)}; true;`}
            onMessage={handleMessage}
            originWhitelist={['http://*', 'https://*']}
            setSupportMultipleWindows={false}
            overScrollMode="never"
            bounces={false}
            keyboardDisplayRequiresUserAction={false}
            hideKeyboardAccessoryView
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color={color.signal} />
              </View>
            )}
            renderError={(_, __, description) => (
              <View style={styles.loading}>
                <Text style={styles.errorTitle}>Couldn&apos;t load the terminal</Text>
                <Text style={styles.errorText}>{description}</Text>
              </View>
            )}
          />
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={color.signal} />
          </View>
        )}
      </KeyboardAvoidingView>
      <View style={{ height: insets.bottom, backgroundColor: color.surface }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  back: { minHeight: HIT, justifyContent: 'center', paddingRight: space.sm },
  backPressed: { opacity: 0.6 },
  backText: { ...type.button, color: color.signal },
  title: { ...type.title, flex: 1 },
  flex: { flex: 1 },
  web: { flex: 1, backgroundColor: color.bg },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
    gap: space.sm,
    padding: space.lg,
  },
  errorTitle: { ...type.body, color: color.text },
  errorText: { ...type.caption, textAlign: 'center' },
});
