import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
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
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!input?.trim() || disabled) return;
    setSending(true);
    try {
      await onSend(input.trim());
      setInput('');
    } catch (err) {
      // swallow; parent handles alerts
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.composerContainer}>
      <TextInput
        style={styles.input}
        value={input}
        onChangeText={setInput}
        placeholder='Message'
        placeholderTextColor={theme.colors.textSecondary}
        editable={!disabled && !loading && !sending}
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
      padding: 12,
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
