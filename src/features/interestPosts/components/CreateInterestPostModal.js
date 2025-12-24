import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { pickAndCompressImage } from '../../../lib/imagePicker';
import { createInterestPost } from '../api/interestPostService';
import { fetchUserInterests } from '../../profile/api/userQueries';
import { useUserStore } from '../../profile/stores/userStore';
import { event as trackEvent } from '../../../services/analyticsService';
import Ionicons from 'react-native-vector-icons/Ionicons';
import logger from '../../../lib/logger';
import { LinearGradient } from 'expo-linear-gradient';
import smileDefault from '../../../../assets/smileDefault.png';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';

const MAX_TEXT_LENGTH = 600;

export default function CreateInterestPostModal({
  visible,
  onClose,
  onCreated,
}) {
  const user = useUserStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [content, setContent] = useState('');
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [interests, setInterests] = useState([]);
  const [media, setMedia] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasLoadedInterests, setHasLoadedInterests] = useState(false);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;
    async function loadInterests() {
      try {
        // Prefer latest server data
        const fetched = await fetchUserInterests();
        if (!mounted) return;
        const list =
          Array.isArray(fetched) && fetched.length
            ? fetched
            : Array.isArray(user?.interests)
            ? user.interests
            : [];
        setInterests(list);
        if (!selectedInterest && list.length) {
          setSelectedInterest(list[0]);
        }
        setHasLoadedInterests(true);
      } catch (error) {
        logger.warn('Failed to load interests', error);
        if (Array.isArray(user?.interests) && user.interests.length) {
          setInterests(user.interests);
          if (!selectedInterest) setSelectedInterest(user.interests[0]);
        }
      }
    }

    loadInterests();
    return () => {
      mounted = false;
    };
  }, [visible, user?.interests]);

  useEffect(() => {
    if (!visible) {
      resetState();
    }
  }, [visible]);

  const resetState = useCallback(() => {
    setContent('');
    setSelectedInterest(null);
    setMedia(null);
    setIsSubmitting(false);
    setHasLoadedInterests(false);
  }, []);

  const handlePickImage = useCallback(async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permission needed', 'Please allow gallery access.');
      }

      // Description: Use pickAndCompressImage with POST limits (10MB/1920px)
      const compressed = await pickAndCompressImage({ aspect: [4, 3] }, 'POST');

      if (compressed) {
        setMedia({
          uri: compressed.uri,
          width: 1920, // Max width from compression
          height: 1920, // Approximation, actual may vary
          mimeType: 'image/jpeg',
        });
      }
    } catch (error) {
      Alert.alert('Image error', error?.message || 'Unable to pick image.');
    }
  }, []);

  const handleRemoveMedia = useCallback(() => setMedia(null), []);

  const canSubmit = useMemo(() => {
    if (!content.trim()) return false;
    if (!selectedInterest) return false;
    if (content.length > MAX_TEXT_LENGTH) return false;
    return true;
  }, [content, selectedInterest]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return;
    try {
      setIsSubmitting(true);
      const payload = {
        content: content.trim(),
        interestId: selectedInterest,
        media,
        creatorId: user?.uid,
      };
      const created = await createInterestPost(payload);
      try {
        trackEvent('post_create', {
          interest: selectedInterest,
          has_media: !!media,
        });
      } catch {}
      onCreated?.(created);
      onClose?.();
      resetState();
    } catch (error) {
      Alert.alert('Post failed', error?.message || 'Unable to create post.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    content,
    selectedInterest,
    media,
    isSubmitting,
    onCreated,
    onClose,
    resetState,
  ]);

  const avatarSource = user?.profileImage
    ? { uri: user.profileImage }
    : smileDefault;

  const statusLabel = useMemo(() => {
    if (isSubmitting) return 'Sharing your post…';
    if (!selectedInterest) return 'Choose an interest to continue';
    if (!content.trim()) return 'Add a story to share';
    return 'Ready to share';
  }, [isSubmitting, selectedInterest, content]);

  const charUsage = content.length / MAX_TEXT_LENGTH;
  const charColor =
    charUsage > 0.9 ? '#FF5A5F' : charUsage > 0.75 ? '#F5A623' : '#8E8E93';

  return (
    <Modal
      visible={visible}
      animationType='fade'
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetContainer}>
            <View
              style={[
                styles.sheet,
                {
                  paddingBottom: insets.bottom,
                  paddingTop: 20,
                },
              ]}
            >
              <View style={styles.sheetHeader}>
                <View style={styles.identityRow}>
                  <Image source={avatarSource} style={styles.avatar} />
                  <View style={styles.identityMeta}>
                    <Text style={styles.identityName} numberOfLines={1}>
                      {user?.firstName || user?.lastName
                        ? `${user?.firstName ?? ''} ${
                            user?.lastName ?? ''
                          }`.trim()
                        : user?.displayName || 'You'}
                    </Text>
                    <Text style={styles.identitySubtitle} numberOfLines={1}>
                      {selectedInterest
                        ? `Posting to ${selectedInterest}`
                        : 'Select an interest'}
                    </Text>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.interestRail}
                >
                  {!hasLoadedInterests ? (
                    <Text style={styles.interestLoading}>
                      Fetching your interests…
                    </Text>
                  ) : (
                    interests.map((interest) => {
                      const active = interest === selectedInterest;
                      return (
                        <TouchableOpacity
                          key={interest}
                          style={[
                            styles.interestChip,
                            active && styles.interestChipActive,
                          ]}
                          onPress={() => setSelectedInterest(interest)}
                        >
                          <Text
                            style={[
                              styles.interestChipText,
                              active && styles.interestChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {interest}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                  {hasLoadedInterests && !interests.length && (
                    <View style={styles.interestEmpty}>
                      <Text style={styles.interestEmptyText}>
                        Add interests in your profile to start posting.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </View>

              <ScrollView
                style={styles.bodyScroll}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps='handled'
              >
                <TouchableOpacity
                  style={[
                    styles.mediaDropZone,
                    media && styles.mediaDropZoneActive,
                  ]}
                  activeOpacity={0.9}
                  onPress={handlePickImage}
                >
                  {media?.uri ? (
                    <View style={styles.mediaPreviewWrapper}>
                      <Image
                        source={{ uri: media.uri }}
                        style={styles.mediaPreview}
                      />
                      <View style={styles.mediaOverlay}>
                        <TouchableOpacity
                          style={styles.mediaOverlayButton}
                          onPress={handlePickImage}
                        >
                          <Ionicons name='image' size={18} color='#fff' />
                          <Text style={styles.mediaOverlayText}>Replace</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.mediaOverlayButton,
                            styles.mediaOverlayButtonGhost,
                          ]}
                          onPress={handleRemoveMedia}
                        >
                          <Ionicons name='close' size={16} color='#0F172A' />
                          <Text
                            style={[
                              styles.mediaOverlayText,
                              styles.mediaOverlayTextDark,
                            ]}
                          >
                            Remove
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.mediaEmpty}>
                      <View style={styles.mediaIconWrapper}>
                        <Ionicons
                          name='images-outline'
                          size={26}
                          color='#5B0FF5'
                        />
                      </View>
                      <Text style={styles.mediaEmptyTitle}>Add a photo</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Add extra vertical spacing between Add a photo and input box */}
                <View style={{ height: 24 }} />

                <View style={styles.editorCard}>
                  <TextInput
                    value={content}
                    onChangeText={setContent}
                    placeholder="What's happening today?"
                    multiline
                    style={styles.editorInput}
                    maxLength={MAX_TEXT_LENGTH}
                    placeholderTextColor={theme.colors.textSecondary}
                    keyboardAppearance={themeMode === 'dark' ? 'dark' : 'light'}
                  />
                  <Text style={[styles.charCount, { color: charColor }]}>
                    {content.length}/{MAX_TEXT_LENGTH}
                  </Text>
                </View>
              </ScrollView>

              <View
                style={[
                  styles.footerBar,
                  {
                    paddingBottom: insets.bottom,
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => {
                    resetState();
                    onClose?.();
                  }}
                >
                  <Text style={styles.footerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.footerStatus}>{statusLabel}</Text>
                <TouchableOpacity
                  activeOpacity={canSubmit && !isSubmitting ? 0.8 : 1}
                  onPress={handleSubmit}
                  disabled={!canSubmit || isSubmitting}
                  style={styles.footerSubmit}
                >
                  {canSubmit && !isSubmitting ? (
                    <LinearGradient
                      colors={['#5B0FF5', '#00B8D9']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.footerSubmitGradient}
                    >
                      <Text style={styles.footerSubmitText}>Post</Text>
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.footerSubmitGradient,
                        styles.footerSubmitDisabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.footerSubmitText,
                          styles.footerSubmitTextDisabled,
                        ]}
                      >
                        {isSubmitting ? 'Posting…' : 'Post'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// Description: Create theme-aware styles for CreateInterestPostModal
const createStyles = (theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    overlay: {
      flex: 1,
      backgroundColor: theme.isDark
        ? 'rgba(15, 23, 42, 0.7)'
        : 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'flex-end',
      alignItems: 'stretch',
    },
    sheetContainer: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      flex: 1,
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      overflow: 'hidden',
      maxHeight: '100%',
      alignSelf: 'stretch',
    },
    sheetHeader: {
      paddingTop: 12,
      paddingBottom: 16,
      paddingHorizontal: 20,
      backgroundColor: theme.isDark
        ? 'rgba(30,41,59,0.75)'
        : 'rgba(255,255,255,0.75)',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.isDark
        ? 'rgba(71,85,105,0.2)'
        : 'rgba(15, 23, 42, 0.08)',
    },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: theme.colors.backgroundSecondary,
      marginRight: 14,
    },
    identityMeta: {
      flex: 1,
    },
    identityName: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    identitySubtitle: {
      marginTop: 2,
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    interestRail: {
      paddingVertical: 4,
      paddingRight: 12,
    },
    interestChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(91, 15, 245, 0.3)'
        : 'rgba(91, 15, 245, 0.18)',
      backgroundColor: theme.isDark
        ? 'rgba(91, 15, 245, 0.1)'
        : 'rgba(241, 244, 255, 0.8)',
      marginRight: 10,
    },
    interestChipActive: {
      backgroundColor: theme.isDark
        ? 'rgba(91, 15, 245, 0.25)'
        : 'rgba(91, 15, 245, 0.12)',
      borderColor: theme.isDark
        ? 'rgba(0, 184, 217, 0.6)'
        : 'rgba(0, 184, 217, 0.45)',
    },
    interestChipText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    interestChipTextActive: {
      color: theme.colors.text,
    },
    interestEmpty: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.isDark
        ? 'rgba(71,85,105,0.3)'
        : 'rgba(226,232,240,0.6)',
      borderRadius: 16,
    },
    interestEmptyText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    interestLoading: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
      paddingRight: 12,
    },
    bodyScroll: {
      flex: 1,
    },
    bodyContent: {
      paddingHorizontal: 20,
      paddingBottom: 180,
    },
    editorCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      padding: 18,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.3 : 0.05,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      elevation: 3,
    },
    editorInput: {
      fontSize: 18,
      lineHeight: 26,
      color: theme.colors.text,
      minHeight: 140,
      textAlignVertical: 'top',
    },
    charCount: {
      alignSelf: 'flex-end',
      marginTop: 12,
      fontSize: 12,
      fontWeight: '600',
    },
    mediaDropZone: {
      marginTop: 24,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(91, 15, 245, 0.25)'
        : 'rgba(91, 15, 245, 0.15)',
      backgroundColor: theme.isDark
        ? 'rgba(30,41,59,0.6)'
        : 'rgba(247, 249, 255, 0.85)',
      padding: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mediaDropZoneActive: {
      padding: 0,
      borderWidth: 0,
      backgroundColor: theme.colors.card,
    },
    mediaEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    mediaIconWrapper: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: theme.isDark
        ? 'rgba(91, 15, 245, 0.15)'
        : 'rgba(91, 15, 245, 0.08)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    mediaEmptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    mediaEmptySubtitle: {
      marginTop: 6,
      textAlign: 'center',
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    mediaPreviewWrapper: {
      width: '100%',
      borderRadius: 22,
      overflow: 'hidden',
    },
    mediaPreview: {
      width: '100%',
      aspectRatio: 4 / 3,
    },
    mediaOverlay: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    mediaOverlayButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
    },
    mediaOverlayButtonGhost: {
      backgroundColor: 'rgba(255,255,255,0.92)',
    },
    mediaOverlayText: {
      marginLeft: 6,
      fontSize: 13,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    mediaOverlayTextDark: {
      color: '#0F172A',
    },
    footerBar: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: Platform.OS === 'ios' ? 28 : 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.isDark
        ? 'rgba(30,41,59,0.9)'
        : 'rgba(255,255,255,0.9)',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.isDark
        ? 'rgba(71,85,105,0.2)'
        : 'rgba(15, 23, 42, 0.08)',
    },
    footerCancel: {
      color: '#EF4444',
      fontSize: 16,
      fontWeight: '600',
    },
    footerStatus: {
      flex: 1,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    footerSubmit: {
      width: 90,
      alignItems: 'flex-end',
    },
    footerSubmitGradient: {
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 18,
      alignItems: 'center',
    },
    footerSubmitDisabled: {
      backgroundColor: theme.isDark ? '#475569' : '#E2E8F0',
    },
    footerSubmitText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    footerSubmitTextDisabled: {
      color: theme.isDark ? '#94A3B8' : '#94A3B8',
    },
  });
