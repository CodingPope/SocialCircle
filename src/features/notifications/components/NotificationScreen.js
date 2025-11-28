import React, {
  useState,
  useEffect,
  memo,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { Image, ActivityIndicator, Pressable } from 'react-native';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { navigateToOtherUserProfile } from '../../../navigation/RootNavigation';
import { SwipeListView } from 'react-native-swipe-list-view';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import RatingStars from '../../profile/components/RatingStars';
import smileDefault from '../../../../assets/smileDefault.png';
import { useUserStore } from '../../profile/stores/userStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import { db, functions } from '../../../services/firebase/config';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
import displayNameFromUser from '../utils/displayName';

// --- Helpers ---
const TypeIcon = ({ type, styles }) => {
  const map = {
    friend_request: { name: 'account-plus', color: '#2563EB' },
    rsvp_request: { name: 'account-check', color: '#0EA5E9' },
    event_update: { name: 'calendar-alert', color: '#F59E0B' },
    chat: { name: 'chat-processing', color: '#22C55E' },
    default: { name: 'bell-outline', color: '#475569' },
  };
  const icon = map[type] || map.default;
  return (
    <View style={[styles.iconWrap, { backgroundColor: `${icon.color}1A` }]}>
      <MaterialCommunityIcons name={icon.name} size={22} color={icon.color} />
    </View>
  );
};

// Description: Renders a notification card based on type (polished UI)
const NotificationCard = memo(
  ({ item, onAccept, onDeny, navigation, markAsRead, styles }) => {
    const [eventTitle, setEventTitle] = useState(item.eventTitle || null);
    const [requester, setRequester] = useState(null);
    const [loading, setLoading] = useState(false);
    // Track if user already acted locally to hide buttons thereafter
    const [acted, setActed] = useState(item.status === 'handled');

    const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);

    // Resolve requesterId from possible fields in payload
    const requesterId =
      item.requesterId ||
      item.actorId ||
      item.fromUserId ||
      item.userId ||
      item.senderId ||
      item.createdBy ||
      null;

    // Fetch missing event/user data for RSVP
    useEffect(() => {
      let mounted = true;
      const isRsvp = item.type === 'rsvp_request';
      const shouldFetchEvent = isRsvp && !eventTitle && item.eventId;

      (async () => {
        try {
          const tasks = [];
          if (shouldFetchEvent) {
            setLoading(true);
            tasks.push(
              db
                .collection('events')
                .doc(item.eventId)
                .get()
                .then((snap) => {
                  if (mounted && snap.exists)
                    setEventTitle(snap.data()?.title || null);
                })
            );
          }

          if (requesterId) {
            tasks.push(
              (async () => {
                let resolved = false;
                try {
                  const map = await ensureSnippets([requesterId]);
                  const snippet = map.get(requesterId);
                  if (mounted && snippet) {
                    resolved = true;
                    setRequester((prev) => ({
                      ...(prev || {}),
                      uid: requesterId,
                      displayName: snippet.name || prev?.displayName || null,
                      name:
                        snippet.name ||
                        prev?.name ||
                        prev?.displayName ||
                        null,
                      profileImage:
                        snippet.photoURL ||
                        prev?.profileImage ||
                        prev?.photoURL ||
                        null,
                      avatarURL:
                        snippet.photoURL ||
                        prev?.avatarURL ||
                        prev?.photoURL ||
                        null,
                      photoURL:
                        snippet.photoURL ||
                        prev?.photoURL ||
                        prev?.profileImage ||
                        null,
                      rating:
                        typeof snippet.rating === 'number'
                          ? snippet.rating
                          : prev?.rating ?? null,
                    }));
                  }
                } catch {}

                if (!resolved) {
                  try {
                    const snap = await db
                      .collection('users')
                      .doc(requesterId)
                      .get();
                    if (mounted && snap.exists) {
                      setRequester((prev) => ({
                        ...(prev || {}),
                        ...snap.data(),
                      }));
                    }
                  } catch {}
                }
              })()
            );
          }

          if (tasks.length) await Promise.all(tasks);
        } catch {
        } finally {
          if (mounted && isRsvp) setLoading(false);
        }
      })();

      return () => {
        mounted = false;
      };
    }, [item.type, item.eventId, requesterId, ensureSnippets, eventTitle]);

    const onPressAvatar = () => {
      if (item.type === 'rsvp_request' && requesterId) {
        markAsRead && markAsRead(item.id);
        navigateToOtherUserProfile(requesterId);
      }
    };

    const onPressPrimary = () => {
      markAsRead && markAsRead(item.id);
      // For RSVP-related notifications, take user straight to the event chat
      if (
        (item.type === 'rsvp_request' || item.type === 'request_accepted') &&
        item.eventId
      ) {
        navigation.navigate('EventChat', { eventId: item.eventId });
        return;
      }
      if (item.type === 'friend_request' && (item.fromUserId || item.userId)) {
        navigateToOtherUserProfile(item.fromUserId || item.userId);
        return;
      }
      // Fallback: if notification has an eventId, go to chat
      if (item.eventId) {
        navigation.navigate('EventChat', { eventId: item.eventId });
        return;
      }
    };

    const renderRSVPLeft = () => {
      const uri =
        requester?.profileImage ||
        requester?.avatarURL ||
        requester?.photoURL ||
        null;
      return (
        <Pressable onPress={onPressAvatar} hitSlop={8}>
          <Image
            source={uri ? { uri } : smileDefault}
            style={styles.avatar}
            resizeMode='cover'
          />
        </Pressable>
      );
    };

    const renderActions = () => {
      if (item.type !== 'rsvp_request') return null;
      if (acted) return null; // Hide after action
      const canAct = Boolean(requesterId && item.eventId);
      return (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[
              styles.pillBtn,
              styles.acceptBtn,
              !canAct && { opacity: 0.5 },
            ]}
            onPress={async () => {
              if (!canAct) return;
              const ok = await onAccept(requesterId, item.id, item.eventId);
              if (ok) setActed(true);
            }}
            accessibilityLabel='Accept RSVP'
            activeOpacity={0.85}
            disabled={!canAct}
          >
            <Text style={styles.pillText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.pillBtn,
              styles.denyBtn,
              !canAct && { opacity: 0.5 },
            ]}
            onPress={async () => {
              if (!canAct) return;
              const ok = await onDeny(requesterId, item.id, item.eventId);
              if (ok) setActed(true);
            }}
            accessibilityLabel='Deny RSVP'
            activeOpacity={0.85}
            disabled={!canAct}
          >
            <Text style={styles.pillText}>Deny</Text>
          </TouchableOpacity>
        </View>
      );
    };

    const Title = () => {
      switch (item.type) {
        case 'rsvp_request':
          return (
            <Text style={styles.titleTxt} numberOfLines={1}>
              {eventTitle || 'Event Title Unavailable'}
            </Text>
          );
        case 'friend_request':
          return <Text style={styles.titleTxt}>Friend request</Text>;
        case 'event_update':
          return <Text style={styles.titleTxt}>Event update</Text>;
        default:
          return <Text style={styles.titleTxt}>Notification</Text>;
      }
    };

    const fallbackActor = useMemo(
      () => ({
        displayName:
          item.requesterName ||
          item.fromUserName ||
          item.userName ||
          item.actorName ||
          null,
        firstName: item.requesterFirstName || null,
        lastName: item.requesterLastName || null,
      }),
      [
        item.requesterName,
        item.fromUserName,
        item.userName,
        item.actorName,
        item.requesterFirstName,
        item.requesterLastName,
      ]
    );

    const actorName = useMemo(
      () => displayNameFromUser(requester || fallbackActor),
      [fallbackActor, requester]
    );

    const Subtitle = () => {
      if (item.type === 'rsvp_request') {
        return (
          <Text style={styles.subtitleTxt} numberOfLines={2}>
            {actorName} requested to join your event
          </Text>
        );
      }

      const baseMessage = item.message || 'You have a new notification';
      const messageText =
        actorName !== 'Someone' && /\bsomeone\b/i.test(baseMessage)
          ? baseMessage.replace(/\bsomeone\b/gi, actorName)
          : baseMessage;

      return (
        <Text style={styles.subtitleTxt} numberOfLines={2}>
          {messageText}
        </Text>
      );
    };

    const TypeBadge = () => {
      const map = {
        friend_request: { label: 'Friend', color: '#2563EB' },
        rsvp_request: { label: 'RSVP', color: '#0EA5E9' },
        event_update: { label: 'Update', color: '#F59E0B' },
        chat: { label: 'Chat', color: '#22C55E' },
      };
      const meta = map[item.type];
      if (!meta) return null;
      return (
        <Badge
          label={meta.label}
          color={meta.color}
          style={{ marginRight: 8 }}
        />
      );
    };

    return (
      <Card style={styles.cardWrap}>
        <TouchableOpacity onPress={onPressPrimary} activeOpacity={0.85}>
          <View style={styles.cardRow}>
            {item.type === 'rsvp_request' ? (
              renderRSVPLeft()
            ) : (
              <TypeIcon type={item.type} styles={styles} />
            )}
            <View style={styles.cardBody}>
              <View style={styles.titleRow}>
                <Title />
                <View style={styles.metaRow}>
                  <TypeBadge />
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
              </View>
              <Subtitle />
              {item.type === 'rsvp_request' && requester?.rating != null && (
                <View style={{ marginTop: 6 }}>
                  <RatingStars rating={Number(requester.rating) || 0} />
                </View>
              )}
              {item.eventLocation ? (
                <Text style={styles.metaTxt} numberOfLines={1}>
                  {item.eventLocation}
                </Text>
              ) : null}
              {item.time ? (
                <Text style={styles.timeTxt}>{item.time}</Text>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
        {renderActions()}
      </Card>
    );
  }
);

const NotificationScreen = () => {
  const navigation = useNavigation();
  // Description: Get user from Zustand store
  const user = useUserStore((state) => state.user);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Notification store
  const notifications = useNotificationStore((s) => s.notifications);
  const softDelete = useNotificationStore((s) => s.softDelete);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Track dynamic heights per row so the hidden delete row matches
  const [rowHeights, setRowHeights] = useState({});
  const onRowLayout = (id, e) => {
    const h = e?.nativeEvent?.layout?.height;
    if (typeof h === 'number' && h > 0) {
      setRowHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
    }
  };

  // Subscribe on mount / user change
  useFocusEffect(
    useCallback(() => {
      markAllAsRead();
    }, [markAllAsRead])
  );

  // Lightweight in-app toast for feedback
  const [toast, setToast] = useState({ visible: false, message: '' });
  const toastTimer = useRef(null);
  const showToast = (message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message });
    toastTimer.current = setTimeout(
      () => setToast({ visible: false, message: '' }),
      1600
    );
  };
  useEffect(
    () => () => toastTimer.current && clearTimeout(toastTimer.current),
    []
  );

  // Accept RSVP request via Cloud Function
  const handleAccept = async (requesterId, notificationId, eventId) => {
    try {
      if (!eventId || !requesterId) {
        console.warn('Accept missing ids', { eventId, requesterId });
        return false;
      }
      const acceptFn = functions.httpsCallable('acceptRsvpRequest');
      await acceptFn({ eventId, userId: requesterId });
      await markAsRead(notificationId);
      showToast('Request accepted');
      return true;
    } catch (err) {
      console.error('Accept failed', err?.message || err);
      showToast('Failed to accept');
      return false;
    }
  };

  // Deny RSVP request via Cloud Function
  const handleDeny = async (requesterId, notificationId, eventId) => {
    try {
      if (!eventId || !requesterId) {
        console.warn('Deny missing ids', { eventId, requesterId });
        return false;
      }
      const declineFn = functions.httpsCallable('declineRsvpRequest');
      await declineFn({ eventId, userId: requesterId });
      await markAsRead(notificationId);
      showToast('Request denied');
      return true;
    } catch (err) {
      console.error('Deny failed', err?.message || err);
      showToast('Failed to deny');
      return false;
    }
  };

  const confirmDeleteNotification = (id) => {
    setPendingDeleteId(id);
    setDeleteModalVisible(true);
  };

  const handleDeleteNotification = async () => {
    try {
      if (pendingDeleteId) await softDelete(pendingDeleteId);
    } finally {
      setDeleteModalVisible(false);
      setPendingDeleteId(null);
    }
  };

  // Renderers
  const renderItem = ({ item }) => (
    <View style={styles.rowContainer} onLayout={(e) => onRowLayout(item.id, e)}>
      <NotificationCard
        item={item}
        onAccept={handleAccept}
        onDeny={handleDeny}
        navigation={navigation}
        markAsRead={markAsRead}
        styles={styles}
      />
    </View>
  );

  const renderHiddenItem = (data) => {
    const id = data.item.id;
    const height = rowHeights[id];
    return (
      <View style={[styles.hiddenRowContainer, height ? { height } : null]}>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => confirmDeleteNotification(id)}
          accessibilityLabel='Delete notification'
        >
          <MaterialCommunityIcons name='delete' size={20} color='#fff' />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel='Go back'
          >
            <Ionicons name='arrow-back' size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <TouchableOpacity
            onPress={() => markAllAsRead()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel='Mark all as read'
          >
            <Text style={styles.headerAction}>Mark all</Text>
          </TouchableOpacity>
        </View>
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Image
            source={require('../../../../assets/smileDefault.png')}
            style={styles.emptyImage}
            resizeMode='contain'
          />
          <Text style={styles.emptyTitle}>You’re all caught up</Text>
          <Text style={styles.emptyText}>
            New RSVPs, event updates, and messages will appear here.
          </Text>
        </View>
      ) : (
        <SwipeListView
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          renderHiddenItem={renderHiddenItem}
          rightOpenValue={-96}
          disableRightSwipe
        />
      )}

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType='fade'
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Notification?</Text>
            <Text style={styles.modalDesc}>
              Are you sure you want to delete this notification?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalDelete]}
                onPress={handleDeleteNotification}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast */}
      {toast.visible && (
        <View style={styles.toast} pointerEvents='none'>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

// Description: Create theme-aware styles for NotificationScreen
const createStyles = (theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },

    header: {
      backgroundColor: theme.colors.card,
      paddingTop: 10,
      paddingBottom: 15,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      padding: 6,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.text,
    },
    headerAction: {
      color: theme.colors.primary,
      fontWeight: '600',
      fontSize: 14,
    },

    // list spacing
    list: { padding: 16 },
    rowContainer: {
      borderRadius: 14,
      marginBottom: 12,
    },

    // Card look
    cardWrap: { padding: 0 },
    cardRow: {
      flexDirection: 'row',
      padding: 14,
      gap: 12,
      alignItems: 'flex-start',
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    cardBody: { flex: 1 },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
    titleTxt: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    subtitleTxt: {
      marginTop: 2,
      fontSize: 13.5,
      color: theme.colors.textSecondary,
    },
    metaTxt: {
      marginTop: 6,
      fontSize: 12.5,
      color: theme.colors.textSecondary,
    },
    timeTxt: {
      marginTop: 6,
      fontSize: 12,
      color: theme.isDark ? '#94A3B8' : '#94A3B8',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.primary,
      marginLeft: 4,
    },

    // Actions under card (for RSVP)
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 14,
      paddingBottom: 12,
    },
    pillBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
    acceptBtn: { backgroundColor: theme.colors.success },
    denyBtn: { backgroundColor: theme.colors.danger },
    pillText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    // Hidden row (revealed on swipe)
    hiddenRowContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      backgroundColor: 'transparent',
      marginBottom: 12,
      paddingRight: 16,
    },
    deleteBtn: {
      width: 60,
      height: 60,
      backgroundColor: theme.colors.danger,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 12,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    deleteText: {
      color: '#fff',
      fontWeight: 'bold',
      marginTop: 2,
      fontSize: 12,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.isDark
        ? 'rgba(0, 0, 0, 0.5)'
        : 'rgba(0, 0, 0, 0.25)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 24,
      width: 300,
      alignItems: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.4 : 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 8,
      color: theme.colors.text,
    },
    modalDesc: {
      fontSize: 15,
      color: theme.colors.textSecondary,
      marginBottom: 18,
      textAlign: 'center',
    },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalButton: {
      borderRadius: 6,
      paddingVertical: 8,
      paddingHorizontal: 18,
      marginHorizontal: 4,
    },
    modalCancel: {
      backgroundColor: theme.isDark ? '#475569' : '#eee',
    },
    modalDelete: { backgroundColor: theme.colors.danger },
    modalButtonText: {
      color: theme.colors.text,
      fontWeight: 'bold',
      fontSize: 15,
    },

    // Empty state
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyImage: { width: 140, height: 140, marginBottom: 10, opacity: 0.9 },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.text,
      marginBottom: 6,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      maxWidth: 280,
    },

    // Toast
    toast: {
      position: 'absolute',
      bottom: 24,
      left: 24,
      right: 24,
      backgroundColor: theme.isDark
        ? 'rgba(51,65,85,0.95)'
        : 'rgba(17,17,17,0.92)',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
    },
    toastText: { color: '#fff', fontWeight: '700' },
  });

export default NotificationScreen;
