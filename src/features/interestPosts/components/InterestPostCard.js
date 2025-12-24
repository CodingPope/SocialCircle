import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import PopupMenu from '../../events/components/PopupMenu';
import {
  addCommentToPost,
  notifyPostComment,
  deleteInterestPost,
} from '../api/interestPostService';
import { event as trackEvent } from '../../../services/analyticsService';
import { reportContent } from '../../../services/firebase/config';
import { useUserStore } from '../../profile/stores/userStore';
import smileDefault from '../../../../assets/smileDefault.png';
import { sharePost } from '../../../services/shareService';
import { useTheme } from '../../../theme';
import EditInterestPostModal from './EditInterestPostModal';

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  return null;
}

export default function InterestPostCard({
  post: initialPost,
  onPress,
  onCommentCreated,
  onDeleted,
  onUpdated,
  style,
  enableInlineComposer = true,
}) {
  const user = useUserStore((state) => state.user);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const keyboardAppearance = theme.isDark ? 'dark' : 'light';
  const [menuVisible, setMenuVisible] = useState(false);
  const [commentVisible, setCommentVisible] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [post, setPost] = useState(initialPost);
  const [commentCount, setCommentCount] = useState(
    initialPost?.commentCount || 0
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLocallyDeleted, setIsLocallyDeleted] = useState(
    initialPost?.isDeleted === true
  );
  const inputRef = useRef(null);
  const [editModalVisible, setEditModalVisible] = useState(false);

  useEffect(() => {
    if (isLocallyDeleted) return;
    setPost(initialPost);
  }, [initialPost, isLocallyDeleted]);

  useEffect(() => {
    if (isLocallyDeleted) return;
    setCommentCount(initialPost?.commentCount || 0);
  }, [initialPost?.commentCount, initialPost?.id, isLocallyDeleted]);

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
      Alert.alert(
        'Unable to report',
        error?.message || 'Please try again later.'
      );
    }
  }, [post?.id, user?.uid]);

  const handleDelete = useCallback(async () => {
    if (!post?.id || isDeleting) return;
    setIsDeleting(true);
    setIsLocallyDeleted(true);
    try {
      await deleteInterestPost(post.id);
      onDeleted?.(post.id);
      Alert.alert('Post deleted', 'Your post has been removed.');
    } catch (error) {
      setIsLocallyDeleted(false);
      Alert.alert('Delete failed', error?.message || 'Unable to delete post.');
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, onDeleted, post?.id]);

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
      notifyPostComment(post, { ...created, id: created.id });
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

  const popupExtraActions = useMemo(() => {
    if (!isOwner) return [];
    return [
      {
        key: 'edit-post',
        label: 'Edit Post',
        onPress: () => setEditModalVisible(true),
      },
    ];
  }, [isOwner]);

  const handlePostUpdated = useCallback(
    (updatedPost) => {
      if (updatedPost) {
        setPost(updatedPost);
        if (typeof updatedPost?.commentCount === 'number') {
          setCommentCount(updatedPost.commentCount);
        }
      }
      onUpdated?.(updatedPost);
    },
    [onUpdated]
  );

  if (isLocallyDeleted) {
    return null;
  }

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
            <Ionicons
              name='chatbubble-ellipses-outline'
              size={16}
              color='#007AFF'
            />
            <Text style={styles.commentText}>Comment</Text>
            <Text style={styles.commentCount}>({commentCount})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={(event) => {
              event?.stopPropagation?.();
              sharePost(post, {
                surface: 'interest_post',
                source: 'discover_card',
              });
            }}
            style={styles.shareButton}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name='share-social-outline' size={16} color='#2563EB' />
            <Text style={styles.shareText}>Share</Text>
          </TouchableOpacity>
        </View>

        {commentVisible && enableInlineComposer && (
          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder='Write a comment…'
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              maxLength={500}
              keyboardAppearance={keyboardAppearance}
            />
            <TouchableOpacity
              style={[
                styles.commentSubmit,
                (!commentText.trim() || commentSubmitting) &&
                  styles.commentSubmitDisabled,
              ]}
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
        extraActions={popupExtraActions}
      />

      <EditInterestPostModal
        visible={editModalVisible}
        post={post}
        onClose={() => setEditModalVisible(false)}
        onUpdated={handlePostUpdated}
      />
    </TouchableOpacity>
  );
}

// Description: Create theme-aware styles for InterestPostCard
const createStyles = (theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.isDark ? 0.4 : 0.08,
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
      backgroundColor: theme.colors.backgroundSecondary,
    },
    meta: {
      marginLeft: 10,
      flex: 1,
    },
    name: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
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
      color: theme.colors.textSecondary,
    },
    timestamp: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    contentText: {
      fontSize: 15,
      color: theme.colors.text,
      marginTop: 12,
      lineHeight: 22,
    },
    interestChip: {
      alignSelf: 'flex-start',
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    interestText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      columnGap: 12,
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
    shareButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: 'rgba(37,99,235,0.12)',
    },
    shareText: {
      marginLeft: 6,
      fontSize: 14,
      color: '#2563EB',
      fontWeight: '600',
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
      color: theme.colors.textSecondary,
      opacity: 0.6,
    },
    composer: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    commentInput: {
      minHeight: 60,
      fontSize: 15,
      textAlignVertical: 'top',
      color: theme.colors.text,
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
