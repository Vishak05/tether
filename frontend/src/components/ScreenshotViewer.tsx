import { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { takeScreenshot } from '../api/commands';
import { getApiErrorMessage } from '../api/errors';
import { color, radius, space } from '../theme';
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
        label={uri ? 'Capture again' : 'Screenshot'}
        onPress={capture}
        busy={busy}
        variant="secondary"
      />

      {/* Only rendered once there's something to show. An empty 16:9 frame
          held ~170dp of nothing above the fold — a worse problem than the
          card resizing that it was there to prevent. */}
      {uri ? <Image source={{ uri }} style={styles.preview} resizeMode="contain" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  preview: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.bg,
  },
});
