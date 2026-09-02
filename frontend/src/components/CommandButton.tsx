import { useState } from 'react';
import { Alert } from 'react-native';

import { getApiErrorMessage } from '../api/errors';
import { Button } from './ui/Button';

interface CommandButtonProps {
  label: string;
  onPress: () => Promise<unknown>;
  variant?: 'default' | 'danger';
}

/**
 * A button bound to an agent command: shows a spinner while the request is in
 * flight and surfaces failures.
 *
 * Now a thin wrapper over the shared Button. Its own `default | danger` prop
 * is kept rather than exposing Button's fuller variant set, because callers
 * pass it and this refactor is visual only.
 */
export function CommandButton({ label, onPress, variant = 'default' }: CommandButtonProps) {
  const [busy, setBusy] = useState(false);

  const handlePress = async () => {
    setBusy(true);
    try {
      await onPress();
    } catch (err) {
      Alert.alert('Command failed', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      label={label}
      onPress={handlePress}
      busy={busy}
      variant={variant === 'danger' ? 'danger' : 'primary'}
    />
  );
}
