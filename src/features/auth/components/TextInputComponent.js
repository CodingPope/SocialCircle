import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store/themeStore';

const TextInputComponent = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
  editable = true,
  style, // additional style overrides from parent
}) => {
  const themeMode = useThemeStore((state) => state.mode);
  const keyboardAppearance = themeMode === 'dark' ? 'dark' : 'light';

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor='#999'
        multiline={multiline}
        keyboardType={keyboardType}
        editable={editable}
        keyboardAppearance={keyboardAppearance}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
  },
});

export default TextInputComponent;
