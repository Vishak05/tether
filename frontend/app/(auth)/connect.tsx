import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../src/auth/AuthContext';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { color, space, type } from '../../src/theme';

// Neither the /pair response nor its QR payload includes the laptop's IP/hostname
// (see docs/phaseF_summary.md) — the user has to enter it once, here.
export default function ConnectScreen() {
  const { connect } = useAuth();
  const insets = useSafeAreaInsets();
  const [host, setHost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = async () => {
    const trimmed = host.trim();
    if (!trimmed) {
      setError('Enter your laptop\'s address (Tailscale IP or local IP)');
      return;
    }
    const url = trimmed.startsWith('http') ? trimmed : `http://${trimmed}`;
    setSubmitting(true);
    setError(null);
    try {
      await connect(url);
      router.replace('/(auth)/pair');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.eyebrow}>Step 1 of 2</Text>
          <Text style={styles.title}>Connect to your laptop</Text>
          <Text style={styles.subtitle}>
            Enter the address the Tether agent is running on — its Tailscale IP if you want this
            to work away from home, or its local IP for the same Wi-Fi.
          </Text>
        </View>

        <Input
          label="Laptop address"
          placeholder="100.x.x.x:8765"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={host}
          onChangeText={(v) => {
            setHost(v);
            if (error) setError(null);
          }}
          onSubmitEditing={handleContinue}
          returnKeyType="go"
          error={error}
          hint="Port 8765 unless you changed it."
        />
      </View>

      {/* Action pinned to the bottom rather than following the text: it's the
          only thing to do here, and it belongs in thumb reach. */}
      <View style={styles.footer}>
        <Button
          label={submitting ? 'Connecting…' : 'Continue'}
          onPress={handleContinue}
          busy={submitting}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg, gap: space.xl },
  head: { gap: space.sm },
  eyebrow: { ...type.label, color: color.signal },
  title: type.display,
  subtitle: type.caption,
  footer: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
});
