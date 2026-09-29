import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function ChatComposer({
  theme,
  input,
  setInput,
  onSend,
  disabled,
  loading,
}) {
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!input?.trim() || disabled) return;
    setSending(true);
    try {
      await onSend(input.trim());
      setInput('');
      if (Platform.OS === 'android') {
        Keyboard.dismiss();
      }
    } catch (err) {
      // swallow; parent handles alerts
    } finally {
      setSending(false);
    }
  };

  return (
    <View
      style={[
        styles.composerContainer,
        { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
    >
      <TextInput
        style={styles.input}
        value={input}
        onChangeText={setInput}
        placeholder='Message'
        placeholderTextColor={theme.colors.textSecondary}
        editable={!disabled && !loading && !sending}
        underlineColorAndroid='transparent'
      />
      <TouchableOpacity
        style={styles.sendButton}
        onPress={handleSend}
        disabled={disabled || loading || sending}
      >
        {sending || loading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <Ionicons name='send' size={22} color={theme.colors.primary} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (theme) =>
  StyleSheet.create({
    composerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 12,
      paddingHorizontal: 12,
      backgroundColor: theme.colors.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    input: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundSecondary || theme.colors.card,
      borderRadius: 12,
      marginRight: 8,
    },
    sendButton: {
      padding: 8,
    },
  });
