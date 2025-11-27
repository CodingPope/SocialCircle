import React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { useThemeStore } from '../../store/themeStore';

export default function InputField({
  value,
  onChangeText,
  placeholder,
  style,
}) {
  const themeMode = useThemeStore((state) => state.mode);
  const keyboardAppearance = themeMode === 'dark' ? 'dark' : 'light';

  return (
    <TextInput
      style={[styles.input, style]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor='#999'
      keyboardAppearance={keyboardAppearance}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 45,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
});
