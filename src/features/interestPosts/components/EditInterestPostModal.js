import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
import { useUserStore } from '../../profile/stores/userStore';
import { fetchUserInterests } from '../../profile/api/userQueries';
import { updateInterestPost } from '../api/interestPostService';

const MAX_TEXT_LENGTH = 600;

export default function EditInterestPostModal({
  visible,
  post,
  onClose,
  onUpdated,
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const user = useUserStore((state) => state.user);

  const [content, setContent] = useState('');
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [interests, setInterests] = useState([]);
  const [loadingInterests, setLoadingInterests] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setContent(post?.content || '');
    setSelectedInterest(post?.interestId || null);
    loadInterests();
  }, [visible, post?.id]);

  const loadInterests = useCallback(async () => {
    if (!visible) return;
    setLoadingInterests(true);
    try {
      const fetched = await fetchUserInterests();
      const baseList =
        Array.isArray(fetched) && fetched.length
          ? fetched
          : Array.isArray(user?.interests)
          ? user.interests
          : [];
      const unique = Array.from(
        new Set([...(baseList || []), post?.interestId].filter(Boolean))
      );
      setInterests(unique);
      if (!selectedInterest && unique.length) {
        setSelectedInterest(unique[0]);
      }
    } catch (error) {
      // console.warn('Failed to load interests', error);
    } finally {
      setLoadingInterests(false);
    }
  }, [post?.interestId, selectedInterest, user?.interests, visible]);

  const canSave = useMemo(() => {
    const trimmed = content.trim();
    return (
      !!post?.id &&
      !!trimmed &&
      trimmed.length <= MAX_TEXT_LENGTH &&
      !!selectedInterest &&
      !saving
    );
  }, [content, post?.id, saving, selectedInterest]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      const updated = await updateInterestPost(post.id, {
        content,
        interestId: selectedInterest,
      });
      onUpdated?.({
        ...post,
        ...updated,
      });
      onClose?.();
    } catch (error) {
      Alert.alert('Update failed', error?.message || 'Unable to update post.');
    } finally {
      setSaving(false);
    }
  }, [canSave, content, onClose, onUpdated, post, selectedInterest]);

  const renderInterestChip = (interest) => {
    const isActive = interest === selectedInterest;
    return (
      <TouchableOpacity
        key={interest}
        style={[styles.chip, isActive && styles.chipActive]}
        onPress={() => setSelectedInterest(interest)}
      >
        <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
          {interest}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType='fade'
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <Text style={styles.title}>Edit Post</Text>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.textArea}
            value={content}
            onChangeText={setContent}
            placeholder='Update your plans…'
            placeholderTextColor={theme.colors.textSecondary}
            multiline
            maxLength={MAX_TEXT_LENGTH}
            keyboardAppearance={themeMode === 'dark' ? 'dark' : 'light'}
          />
          <Text
            style={styles.charCount}
          >{`${content.length}/${MAX_TEXT_LENGTH}`}</Text>

          <Text style={[styles.label, { marginTop: 16 }]}>Interest</Text>
          {loadingInterests ? (
            <ActivityIndicator
              color={theme.colors.primary}
              style={{ marginVertical: 12 }}
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {interests.map(renderInterestChip)}
              {interests.length === 0 && (
                <Text style={styles.emptyInterests}>
                  Add interests on your profile to categorize posts.
                </Text>
              )}
            </ScrollView>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                !canSave && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    sheet: {
      width: '100%',
      borderRadius: 20,
      backgroundColor: theme.colors.card,
      paddingHorizontal: 20,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 8,
    },
    textArea: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      padding: 12,
      minHeight: 110,
      fontSize: 15,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
    },
    charCount: {
      alignSelf: 'flex-end',
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    chipRow: {
      paddingVertical: 4,
      columnGap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    chipActive: {
      backgroundColor: theme.colors.primary,
    },
    chipLabel: {
      fontSize: 14,
      color: theme.colors.text,
      fontWeight: '500',
    },
    chipLabelActive: {
      color: theme.colors.neutral100,
    },
    emptyInterests: {
      color: theme.colors.textSecondary,
      fontSize: 13,
    },
    buttonRow: {
      flexDirection: 'row',
      columnGap: 12,
      marginTop: 24,
    },
    button: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: theme.colors.backgroundSecondary,
    },
    cancelText: {
      fontWeight: '600',
      color: theme.colors.text,
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveText: {
      fontWeight: '700',
      color: theme.colors.neutral100,
    },
  });
