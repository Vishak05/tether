import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { color, HIT, radius, space, type } from '../../theme';

interface InputProps extends TextInputProps {
  label?: string;
  /** Shown below the field in the danger tone. */
  error?: string | null;
  /** Shown below the field when there's no error. */
  hint?: string;
}

/**
 * Text field with a visible focus state.
 *
 * The focus ring is not decorative — on a dark ground a field and its
 * container are close enough in value that without it there's no reliable
 * signal for which field the keyboard is aimed at.
 */
export function Input({ label, error, hint, style, onFocus, onBlur, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.root}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={color.textMuted}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
          style,
        ]}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  label: type.label,
  input: {
    minHeight: HIT + space.sm,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surfaceRaised,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    fontSize: 16,
    fontWeight: '600',
    color: color.text,
  },
  inputFocused: { borderColor: color.signal, backgroundColor: color.surface },
  inputError: { borderColor: color.danger },
  error: { ...type.caption, color: color.danger },
  hint: type.caption,
});
