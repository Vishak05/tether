import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../../src/auth/AuthContext';

// Neither the /pair response nor its QR payload includes the laptop's IP/hostname
// (see docs/phaseF_summary.md) — the user has to enter it once, here.
export default function ConnectScreen() {
  const { connect } = useAuth();
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Connect to your laptop</Text>
      <Text style={styles.subtitle}>
        Enter the Tailscale IP (or local IP) and port the Tether agent is running on.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="100.x.x.x:8765"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={host}
        onChangeText={setHost}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleContinue}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>{submitting ? 'Connecting…' : 'Continue'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  error: { color: '#c0392b', marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
