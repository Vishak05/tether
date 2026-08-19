import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { takeScreenshot } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';

export function ScreenshotViewer() {
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    setBusy(true);
    try {
      const { result } = await takeScreenshot();
      if (result) setUri(`data:image/${result.format};base64,${result.data_base64}`);
    } catch (err) {
      Alert.alert('Screenshot failed', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.button} onPress={capture} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Take Screenshot</Text>}
      </Pressable>
      {uri ? <Image source={{ uri }} style={styles.preview} resizeMode="contain" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  preview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: '#000' },
});
