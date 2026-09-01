import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { takeScreenshot } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';
import { color, radius, space, type } from '../theme';
import { Button } from './ui/Button';

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
      <Button
        label={uri ? 'Capture again' : 'Take screenshot'}
        onPress={capture}
        busy={busy}
        variant="secondary"
      />

      {/* An empty frame rather than nothing: it shows where the capture will
          land and keeps the card from resizing when the first one arrives. */}
      <View style={styles.frame}>
        {uri ? (
          <Image source={{ uri }} style={styles.preview} resizeMode="contain" />
        ) : (
          <Text style={styles.empty}>No capture yet</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md },
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  preview: { width: '100%', height: '100%' },
  empty: type.caption,
});
