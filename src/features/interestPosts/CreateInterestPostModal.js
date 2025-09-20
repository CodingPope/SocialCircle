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
import { createInterestPost } from './interestPostService';
import { fetchUserInterests } from '../profile/userQueries';
import { useUserStore } from '../profile/userStore';
import { event as trackEvent } from '../../services/analytics';
import Ionicons from 'react-native-vector-icons/Ionicons';

const MAX_TEXT_LENGTH = 2000;

export default function CreateInterestPostModal({
  visible,
  onClose,
  onCreated,
}) {
  const user = useUserStore((state) => state.user);

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
        const list = Array.isArray(fetched) && fetched.length
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
        console.warn('Failed to load interests', error);
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
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permission needed', 'Please allow gallery access.');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        setMedia({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      }
    } catch (error) {
      Alert.alert('Image error', error?.message || 'Unable to pick image.');
    }
  }, []);

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
  }, [canSubmit, content, selectedInterest, media, isSubmitting, onCreated, onClose, resetState]);

  const headerTitle = hasLoadedInterests
    ? 'Share something with your circle'
    : 'Loading interests...';

  return (
    <Modal
      visible={visible}
      animationType='slide'
      onRequestClose={onClose}
      presentationStyle='fullScreen'
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            style={[styles.postButton, (!canSubmit || isSubmitting) && styles.postButtonDisabled]}
          >
            <Text style={styles.postButtonText}>
              {isSubmitting ? 'Posting…' : 'Post'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps='handled'
        >
          <Text style={styles.label}>Message</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder='What do you want to share?'
            multiline
            style={styles.textInput}
            maxLength={MAX_TEXT_LENGTH}
          />
          <Text style={styles.charCount}>{`${content.length}/${MAX_TEXT_LENGTH}`}</Text>

          <Text style={[styles.label, { marginTop: 16 }]}>Choose an interest</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {interests.map((interest) => {
              const isActive = interest === selectedInterest;
              return (
                <TouchableOpacity
                  key={interest}
                  style={[styles.chip, isActive && styles.chipActive]}
                  onPress={() => setSelectedInterest(interest)}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {interest}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {!interests.length && (
              <View style={styles.emptyChip}>
                <Text style={styles.emptyChipText}>
                  Add interests in your profile to post.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.mediaSection}>
            <Text style={styles.label}>Optional image</Text>
            <TouchableOpacity style={styles.mediaButton} onPress={handlePickImage}>
              <Ionicons name='image' size={18} color='#007AFF' />
              <Text style={styles.mediaButtonText}>
                {media ? 'Change image' : 'Add image'}
              </Text>
            </TouchableOpacity>
            {media?.uri && (
              <Image source={{ uri: media.uri }} style={styles.previewImage} />
            )}
            <Text style={styles.mediaHint}>
              Images are compressed to stay under 10MB. Video support coming soon.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 18 : 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    color: '#ff3b30',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  postButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  postButtonDisabled: {
    backgroundColor: '#9cc7ff',
  },
  postButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  contentContainer: {
    padding: 16,
  },
  label: {
    fontSize: 14,
    color: '#444',
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#8e8e93',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  chipsRow: {
    paddingVertical: 4,
    paddingRight: 16,
  },
  chip: {
    backgroundColor: '#f2f2f7',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#007AFF',
  },
  chipText: {
    fontSize: 14,
    color: '#111',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
  },
  emptyChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f8f4ff',
  },
  emptyChipText: {
    color: '#8e8e93',
    fontSize: 13,
  },
  mediaSection: {
    marginTop: 24,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  mediaButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    marginTop: 12,
  },
  mediaHint: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 6,
  },
});
