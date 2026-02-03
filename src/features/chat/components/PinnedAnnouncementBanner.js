/**
 * PinnedAnnouncementBanner - Displays pinned announcement at top of chat
 * Includes editor modal for hosts to create/edit pinned messages
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Description: Banner showing the current pinned announcement
export function PinnedBanner({ pinned, onPress, onDismiss, theme }) {
  if (!pinned?.text) return null;

  const styles = createBannerStyles(theme);

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.iconContainer}>
        <Ionicons name='megaphone' size={18} color={theme.colors.primary} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.label}>Pinned Announcement</Text>
        <Text style={styles.text} numberOfLines={2}>
          {pinned.text}
        </Text>
      </View>
      {onDismiss && (
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <Ionicons name='close' size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// Description: Modal for editing pinned announcement (host only)
export function PinnedEditorModal({
  visible,
  onClose,
  onSave,
  initialText,
  theme,
  saving,
}) {
  const [text, setText] = useState(initialText || '');
  const styles = createEditorStyles(theme);

  // Reset text when modal opens
  React.useEffect(() => {
    if (visible) {
      setText(initialText || '');
    }
  }, [visible, initialText]);

  const handleSave = useCallback(() => {
    onSave(text.trim());
  }, [onSave, text]);

  const handleClear = useCallback(() => {
    onSave(''); // Empty string to clear pinned
  }, [onSave]);

  const canSave = text.trim() !== (initialText || '');
  const hasExisting = !!initialText;

  return (
    <Modal
      visible={visible}
      animationType='slide'
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {hasExisting ? 'Edit Announcement' : 'Pin Announcement'}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name='close' size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.description}>
              Pinned announcements appear at the top of the chat for all
              members.
            </Text>

            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder='Enter your announcement...'
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              textAlignVertical='top'
              maxLength={500}
              autoFocus
            />

            <Text style={styles.charCount}>{text.length}/500 characters</Text>
          </View>

          <View style={styles.actions}>
            {hasExisting && (
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.clearButton,
                  saving && styles.buttonDisabled,
                ]}
                onPress={handleClear}
                disabled={saving}
              >
                <Ionicons
                  name='trash-outline'
                  size={18}
                  color={theme.colors.error || '#ff3b30'}
                />
                <Text style={styles.clearButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                (!canSave || saving) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={!canSave || saving}
            >
              {saving ? (
                <ActivityIndicator size='small' color='#fff' />
              ) : (
                <>
                  <Ionicons name='megaphone' size={18} color='#fff' />
                  <Text style={styles.saveButtonText}>
                    {hasExisting ? 'Update' : 'Pin'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createBannerStyles = (theme) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: `${theme.colors.primary}20`,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    textContainer: {
      flex: 1,
    },
    label: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    text: {
      fontSize: 14,
      color: theme.colors.text,
      lineHeight: 18,
    },
    dismissButton: {
      padding: 6,
      marginLeft: 8,
    },
  });

const createEditorStyles = (theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    closeButton: {
      padding: 4,
    },
    content: {
      padding: 16,
    },
    description: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    input: {
      backgroundColor:
        theme.colors.backgroundSecondary || theme.colors.background,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: theme.colors.text,
      minHeight: 120,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    charCount: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textAlign: 'right',
      marginTop: 8,
    },
    actions: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 12,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 14,
      borderRadius: 10,
      gap: 8,
    },
    clearButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.error || '#ff3b30',
    },
    clearButtonText: {
      fontSize: 16,
      color: theme.colors.error || '#ff3b30',
      fontWeight: '500',
    },
    saveButton: {
      flex: 1,
      backgroundColor: theme.colors.primary,
    },
    saveButtonText: {
      fontSize: 16,
      color: '#fff',
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
  });

export default {
  PinnedBanner,
  PinnedEditorModal,
};
