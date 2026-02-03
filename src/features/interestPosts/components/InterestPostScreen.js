import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import Ionicons from 'react-native-vector-icons/Ionicons';
import InterestPostCard from './InterestPostCard';
import PopupMenu from '../../events/components/PopupMenu';
import {
  addCommentToPost,
  fetchInterestPostById,
  fetchMoreComments,
  listenToComments,
  notifyPostComment,
  softDeleteComment,
  toMillis,
} from '../api/interestPostService';
import { reportContent } from '../../../services/firebase';
import { useUserStore } from '../../profile/stores/userStore';
import smileDefault from '../../../../assets/smileDefault.png';
import { event as trackEvent } from '../../../services/analyticsService';
import { useTheme } from '../../../theme';
import logger from '../../../lib/logger';

const PAGE_SIZE = 20;
const TOP_BAR_HEIGHT = 52;

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function CommentItem({ comment, onReport, onDelete, isOwner, theme }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const created = toDate(comment?.createdAt);
  let timestamp = 'moments ago';
  if (created) {
    try {
      timestamp = formatDistanceToNow(created, { addSuffix: true });
    } catch {
      timestamp = created.toLocaleDateString();
    }
  }

  const styles = useMemo(() => createCommentStyles(theme), [theme]);

  return (
    <View style={styles.commentRow}>
      <Image
        source={
          comment?.authorSnapshot?.avatarUrl
            ? { uri: comment.authorSnapshot.avatarUrl }
            : smileDefault
        }
        style={styles.commentAvatar}
      />
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.commentAuthor} numberOfLines={1}>
              {comment?.authorSnapshot?.displayName || 'Community Member'}
            </Text>
            <Text style={styles.commentTimestamp}>{timestamp}</Text>
          </View>
          <TouchableOpacity onPress={() => setMenuVisible(true)}>
            <Ionicons name='ellipsis-horizontal' size={16} color='#8e8e93' />
          </TouchableOpacity>
        </View>
        <Text style={styles.commentText}>{comment?.body}</Text>
        <PopupMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          isOwner={isOwner}
          onReport={() => {
            setMenuVisible(false);
            onReport?.(comment);
          }}
          onDelete={() => {
            setMenuVisible(false);
            onDelete?.(comment);
          }}
          eventId={comment?.id}
          targetType='comment'
        />
      </View>
    </View>
  );
}

export default function InterestPostScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const user = useUserStore((state) => state.user);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const keyboardAppearance = theme.isDark ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { postId, initialPost } = route.params || {};

  const [post, setPost] = useState(initialPost || null);
  const [comments, setComments] = useState([]);
  const [paginationCursor, setPaginationCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const composerRef = useRef(null);

  // Enable swipe-back gesture (default for stack navigation)
  useEffect(() => {
    navigation.setOptions?.({
      gestureEnabled: true,
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;
    async function loadPost() {
      if (initialPost) {
        setPost(initialPost);
      }
      if (!postId) return;
      try {
        const latest = await fetchInterestPostById(postId);
        if (isMounted && latest) setPost(latest);
        try {
          trackEvent('post_open', {
            post_id: postId,
            interest: latest?.interestId || initialPost?.interestId || null,
          });
        } catch {}
      } catch (error) {
        logger.warn('Failed to load post', error);
      }
    }
    loadPost();
    return () => {
      isMounted = false;
    };
  }, [postId, initialPost]);

  useEffect(() => {
    if (!postId) return;
    const unsubscribe = listenToComments(postId, {
      limitCount: PAGE_SIZE,
      onUpdate: (list, cursor) => {
        const sorted = [...list].sort(
          (a, b) => toMillis(a.createdAt) - toMillis(b.createdAt)
        );
        setComments(sorted);
        setPaginationCursor(cursor);
        setPost((prev) =>
          prev
            ? { ...prev, commentCount: prev.commentCount || list.length }
            : prev
        );
      },
    });
    return unsubscribe;
  }, [postId]);

  // ...existing code...
  // ...existing code...
  // ...existing code...
  const focusComposer = useCallback(() => {
    try {
      composerRef.current?.focus();
    } catch {}
  }, []);

  const sendComment = useCallback(async () => {
    const trimmed = composerText.trim();
    if (!trimmed || sending || !postId) return;
    try {
      setSending(true);
      const created = await addCommentToPost(postId, trimmed);
      setComposerText('');
      setPost((prev) =>
        prev ? { ...prev, commentCount: (prev.commentCount || 0) + 1 } : prev
      );
      const targetPost = post ? { ...post, id: postId } : { id: postId };
      notifyPostComment(targetPost, created);
      try {
        trackEvent('post_comment', {
          post_id: postId,
          surface: 'post_detail',
        });
      } catch {}
    } catch (error) {
      Alert.alert('Comment failed', error?.message || 'Unable to add comment.');
    } finally {
      setSending(false);
    }
  }, [composerText, sending, postId, post]);

  const loadOlderComments = useCallback(async () => {
    if (!postId || !paginationCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const { comments: older, cursor } = await fetchMoreComments(
        postId,
        paginationCursor,
        PAGE_SIZE
      );
      const normalized = [...older].sort(
        (a, b) => toMillis(a.createdAt) - toMillis(b.createdAt)
      );
      setComments((prev) => [...normalized, ...prev]);
      setPaginationCursor(cursor);
    } catch (error) {
      Alert.alert(
        'Unable to load more comments',
        error?.message || 'Please try again.'
      );
    } finally {
      setLoadingMore(false);
    }
  }, [postId, paginationCursor, loadingMore]);

  const handleReportComment = useCallback(
    async (comment) => {
      try {
        await reportContent(
          user?.uid,
          `${postId}:${comment.id}`,
          'interest_comment',
          'Inappropriate comment',
          { context: { postId, commentId: comment.id } }
        );
        Alert.alert('Report received', 'Thanks for letting us know.');
      } catch (error) {
        Alert.alert('Unable to report', error?.message || 'Please try later.');
      }
    },
    [postId, user?.uid]
  );

  const handleDeleteComment = useCallback(
    async (comment) => {
      try {
        await softDeleteComment(postId, comment.id);
        setComments((prev) => prev.filter((c) => c.id !== comment.id));
        setPost((prev) =>
          prev
            ? {
                ...prev,
                commentCount: Math.max((prev.commentCount || 1) - 1, 0),
              }
            : prev
        );
      } catch (error) {
        Alert.alert(
          'Delete failed',
          error?.message || 'Unable to remove comment.'
        );
      }
    },
    [postId]
  );

  const renderComment = useCallback(
    ({ item }) => (
      <CommentItem
        comment={item}
        onReport={handleReportComment}
        onDelete={handleDeleteComment}
        isOwner={item?.authorId === user?.uid}
        theme={theme}
      />
    ),
    [handleDeleteComment, handleReportComment, user?.uid, theme]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const header = useMemo(() => {
    return (
      <View>
        <InterestPostCard
          post={post}
          onPress={focusComposer}
          enableInlineComposer={false}
          onDeleted={() => navigation.goBack()}
          style={styles.headerCard}
        />
        <View style={styles.commentHeaderRow}>
          <Text style={styles.commentHeaderText}>
            {post?.commentCount
              ? `${post.commentCount} comments`
              : 'Start the conversation'}
          </Text>
          {paginationCursor && (
            <TouchableOpacity
              onPress={loadOlderComments}
              disabled={loadingMore}
            >
              <Text style={styles.loadMoreText}>
                {loadingMore ? 'Loading…' : 'Load older comments'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [
    post,
    focusComposer,
    navigation,
    paginationCursor,
    loadOlderComments,
    loadingMore,
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Top bar with back icon */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel='Go back'
        >
          <Ionicons name='chevron-back' size={28} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={styles.flex}
      >
        <View style={styles.pageContent}>
          <FlatList
            style={styles.list}
            data={comments}
            renderItem={renderComment}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode={
              Platform.OS === 'ios' ? 'interactive' : 'on-drag'
            }
            keyboardShouldPersistTaps='handled'
            ListHeaderComponent={header}
            ListEmptyComponent={
              <Text style={styles.emptyState}>
                No comments yet. Be the first!
              </Text>
            }
          />
          <View style={styles.composerBar}>
            <View style={styles.composerInputWrapper}>
              <TextInput
                ref={composerRef}
                style={styles.composerInput}
                value={composerText}
                onChangeText={setComposerText}
                placeholder='Write a comment'
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                maxLength={300}
                keyboardAppearance={keyboardAppearance}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.composerSend,
                (!composerText.trim() || sending) &&
                  styles.composerSendDisabled,
              ]}
              onPress={sendComment}
              disabled={!composerText.trim() || sending}
            >
              <Text style={styles.composerSendText}>
                {sending ? 'Sending…' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Description: Create theme-aware styles for comment items
const createCommentStyles = (theme) =>
  StyleSheet.create({
    commentRow: {
      flexDirection: 'row',
      marginBottom: 18,
    },
    commentAvatar: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.colors.backgroundSecondary,
      marginRight: 12,
    },
    commentBody: {
      flex: 1,
      padding: 12,
      backgroundColor: theme.colors.card,
      borderRadius: 16,
    },
    commentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    commentAuthor: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
    },
    commentTimestamp: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    commentText: {
      fontSize: 15,
      color: theme.colors.text,
      lineHeight: 22,
    },
  });

// Description: Create theme-aware styles for InterestPostScreen
const createStyles = (theme) =>
  StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      height: TOP_BAR_HEIGHT,
      paddingHorizontal: 8,
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      zIndex: 10,
    },
    backButton: {
      padding: 8,
      marginLeft: 2,
      marginTop: 2,
    },
    safe: { flex: 1, backgroundColor: theme.colors.background },
    flex: { flex: 1 },
    pageContent: {
      flex: 1,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    headerCard: {
      marginTop: 12,
    },
    commentHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 24,
      marginBottom: 12,
    },
    commentHeaderText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    loadMoreText: {
      fontSize: 14,
      color: '#007AFF',
      fontWeight: '600',
    },
    emptyState: {
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontSize: 15,
      marginTop: 40,
    },
    commentRow: {
      flexDirection: 'row',
      marginBottom: 18,
    },
    commentAvatar: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.colors.backgroundSecondary,
      marginRight: 12,
    },
    commentBody: {
      flex: 1,
      padding: 12,
      backgroundColor: theme.colors.card,
      borderRadius: 16,
    },
    commentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    commentAuthor: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
    },
    commentTimestamp: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    commentText: {
      fontSize: 15,
      color: theme.colors.text,
      lineHeight: 22,
    },
    composerBar: {
      paddingTop: 12,
      paddingHorizontal: 16,
      paddingBottom: 25,
      backgroundColor: theme.colors.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    composerInputWrapper: {
      flex: 1,
      marginRight: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      backgroundColor: theme.colors.inputBackground,
      overflow: 'hidden',
    },
    composerInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
      fontSize: 15,
      textAlignVertical: 'top',
      color: theme.colors.text,
    },
    composerSend: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.primary,
    },
    composerSendDisabled: {
      opacity: 0.4,
    },
    composerSendText: {
      color: theme.colors.background,
      fontWeight: '600',
      fontSize: 15,
    },
  });
