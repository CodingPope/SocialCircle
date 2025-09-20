import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import PopupMenu from '../events/PopupMenu';
import {
  addCommentToPost,
  notifyPostComment,
  deleteInterestPost,
} from './interestPostService';
import { event as trackEvent } from '../../services/analytics';
import { reportContent } from '../../firebase/config';
import { useUserStore } from '../profile/userStore';
import smileDefault from '../../../assets/smileDefault.png';

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  return null;
}

export default function InterestPostCard({
  post,
  onPress,
  onCommentCreated,
  onDeleted,
  style,
  enableInlineComposer = true,
}) {
  const user = useUserStore((state) => state.user);
  const [menuVisible, setMenuVisible] = useState(false);
  const [commentVisible, setCommentVisible] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(post?.commentCount || 0);
  const inputRef = useRef(null);

  const isOwner = user?.uid && post?.creatorId === user.uid;

  const creatorName = useMemo(() => {
    return (
      post?.creatorSnapshot?.displayName ||
      post?.creatorSnapshot?.name ||
      'Anonymous User'
    );
  }, [post?.creatorSnapshot]);

  const createdAtLabel = useMemo(() => {
    const created = toDate(post?.createdAt);
    if (!created) return 'moments ago';
    try {
      return formatDistanceToNow(created, { addSuffix: true });
    } catch {
      return created.toLocaleDateString();
    }
  }, [post?.createdAt]);

  const handleReport = useCallback(async () => {
    try {
      await reportContent(
        user?.uid,
        post?.id,
        'interest_post',
        'Inappropriate content',
        {
          context: { postId: post?.id },
        }
      );
      Alert.alert('Report received', 'Thanks for letting us know.');
    } catch (error) {
      Alert.alert('Unable to report', error?.message || 'Please try again later.');
    }
  }, [post?.id, user?.uid]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteInterestPost(post.id);
      Alert.alert('Post deleted', 'Your post has been removed.');
      onDeleted?.(post.id);
    } catch (error) {
      Alert.alert('Delete failed', error?.message || 'Unable to delete post.');
    }
  }, [onDeleted, post?.id]);

  const toggleComposer = useCallback(() => {
    if (!enableInlineComposer) {
      onPress?.();
      return;
    }
    setCommentVisible((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          try {
            inputRef.current?.focus();
          } catch {}
        }, 80);
      }
      return next;
    });
  }, [enableInlineComposer, onPress]);

  const submitComment = useCallback(async () => {
    const trimmed = commentText.trim();
    if (!trimmed || commentSubmitting) return;
    try {
      setCommentSubmitting(true);
      const created = await addCommentToPost(post.id, trimmed);
      setCommentText('');
      setCommentVisible(false);
      setCommentCount((prev) => prev + 1);
      onCommentCreated?.(created);
      await notifyPostComment(post, { ...created, id: created.id });
      try {
        trackEvent('post_comment', {
          post_id: post.id,
          surface: 'discover_inline',
        });
      } catch {}
    } catch (error) {
      Alert.alert('Comment failed', error?.message || 'Unable to add comment.');
    } finally {
      setCommentSubmitting(false);
    }
  }, [commentSubmitting, commentText, post, onCommentCreated]);

  const avatarSource = post?.creatorSnapshot?.avatarUrl
    ? { uri: post.creatorSnapshot.avatarUrl }
    : smileDefault;

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={[styles.card, style]}
    >
      {post?.mediaUrl && (
        <Image source={{ uri: post.mediaUrl }} style={styles.media} />
      )}
      <View style={styles.inner}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Image source={avatarSource} style={styles.avatar} />
            <View style={styles.meta}>
              <Text style={styles.name} numberOfLines={1}>
                {creatorName}
              </Text>
              <View style={styles.ratingRow}>
                <MaterialIcons name='star-rate' size={16} color='#f5a623' />
                <Text style={styles.ratingText}>
                  {typeof post?.creatorSnapshot?.rating === 'number'
                    ? post.creatorSnapshot.rating.toFixed(1)
                    : '—'}
                </Text>
                <Text style={styles.timestamp}>• {createdAtLabel}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={() => setMenuVisible(true)}>
            <Ionicons name='ellipsis-horizontal' size={20} color='#8e8e93' />
          </TouchableOpacity>
        </View>

        <Text style={styles.contentText}>{post?.content}</Text>

        {post?.interestId && (
          <View style={styles.interestChip}>
            <Text style={styles.interestText}>{post.interestId}</Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={(event) => {
              event?.stopPropagation?.();
              toggleComposer();
            }}
            style={styles.commentButton}
            activeOpacity={0.8}
          >
            <Ionicons name='chatbubble-ellipses-outline' size={16} color='#007AFF' />
            <Text style={styles.commentText}>Comment</Text>
            <Text style={styles.commentCount}>({commentCount})</Text>
          </TouchableOpacity>
          <View style={styles.likePlaceholder}>
            <Ionicons name='heart-outline' size={16} color='#c7c7cc' />
            <Text style={styles.likePlaceholderText}>Likes coming soon</Text>
          </View>
        </View>

        {commentVisible && enableInlineComposer && (
          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder='Write a comment…'
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.commentSubmit, (!commentText.trim() || commentSubmitting) && styles.commentSubmitDisabled]}
              onPress={submitComment}
              disabled={!commentText.trim() || commentSubmitting}
            >
              <Text style={styles.commentSubmitText}>
                {commentSubmitting ? 'Sending…' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <PopupMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        isOwner={!!isOwner}
        onReport={handleReport}
        onDelete={handleDelete}
        eventId={post?.id}
        targetType='post'
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  media: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  inner: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#f2f2f7',
  },
  meta: {
    marginLeft: 10,
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  ratingText: {
    marginLeft: 4,
    marginRight: 6,
    fontSize: 13,
    color: '#8e8e93',
  },
  timestamp: {
    fontSize: 13,
    color: '#8e8e93',
  },
  contentText: {
    fontSize: 15,
    color: '#1c1c1e',
    marginTop: 12,
    lineHeight: 22,
  },
  interestChip: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#f2f2f7',
  },
  interestText: {
    fontSize: 13,
    color: '#636366',
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,122,255,0.12)',
  },
  commentText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  commentCount: {
    marginLeft: 4,
    fontSize: 13,
    color: '#007AFF',
  },
  likePlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  likePlaceholderText: {
    marginLeft: 6,
    fontSize: 13,
    color: '#c7c7cc',
  },
  composer: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    borderRadius: 12,
    padding: 12,
  },
  commentInput: {
    minHeight: 60,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  commentSubmit: {
    marginTop: 12,
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  commentSubmitDisabled: {
    backgroundColor: '#9cc7ff',
  },
  commentSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
