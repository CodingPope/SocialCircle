import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ScrollView,
  StatusBar,
  Platform,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  getUserData,
  updateUserData,
  updateUserRating,
  db,
  deleteEvent,
  sendNotification,
  reportContent,
  followUser,
  unfollowUser,
  functions,
} from '../../../firebase/config';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from '../../../firebase/firestoreCompat';
import { useUserStore } from '../../profile/stores/userStore';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import PopupMenu from './PopupMenu';
import PostCard from './PostCard';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
import InterestPostCard from '../../interestPosts/components/InterestPostCard';
import { fetchInterestPostsByCreator } from '../../interestPosts/services/interestPostService';
import { trackReportContent } from '../../../lib/analytics';
import { shareEvent } from '../../../services/share';
import {
  getEventEndMs,
  getTimelineTimestamp,
  mergeUniqueEvents,
} from '../utils/dateUtils';
import {
  blockUser as blockUserService,
  unblockUser as unblockUserService,
} from '../../profile/services/blockService';

export default function OtherUserProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const originTab = route.params?.originTab;
  const [user, setUser] = useState(null);
  const [userEvents, setUserEvents] = useState({
    created: [],
    attending: [],
    attended: [],
  });
  const [interestPosts, setInterestPosts] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [hostMap, setHostMap] = useState({}); // Map of ownerId -> user info
  // Description: Get current user from Zustand userStore
  const currentUser = useUserStore((state) => state.user);
  const setUserStore = useUserStore((state) => state.setUser);
  const fetchCurrentUser = useUserStore((state) => state.fetchUser);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCountView, setFollowerCountView] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [selectedRating, setSelectedRating] = useState(0);
  const [requestingFollow, setRequestingFollow] = useState(false);
  const [sharedEvents, setSharedEvents] = useState(false); // Track if shared events exist
  const [ratingModalVisible, setRatingModalVisible] = useState(false); // Modal for rating
  const [blockBusy, setBlockBusy] = useState(false);

  const EDGE_SWIPE_START_THRESHOLD = 30;

  const handleBackPress = useCallback(() => {
    const parent = navigation.getParent?.();

    if (originTab && originTab !== 'ProfileStack' && parent?.navigate) {
      parent.navigate(originTab);
      return;
    }

    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    if (originTab === 'ProfileStack') {
      navigation.navigate('ProfileStack', { screen: 'Profile' });
      return;
    }

    if (parent?.canGoBack?.()) {
      parent.goBack();
      return;
    }

    parent?.navigate?.('Map');
  }, [navigation, originTab]);
  // Swipe right to go back (left-edge gesture only)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy, x0 } = gestureState;
        const startedNearEdge = x0 <= EDGE_SWIPE_START_THRESHOLD;
        if (!startedNearEdge) return false;
        const horizontalDominant = Math.abs(dx) > Math.abs(dy);
        const movedEnough = dx > 12;
        return horizontalDominant && movedEnough;
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx, x0 } = gestureState;
        if (x0 > EDGE_SWIPE_START_THRESHOLD) return;
        const distancePass = dx > 60;
        const velocityPass = vx > 0.35 && dx > 0;
        if ((distancePass || velocityPass) && navigation.canGoBack?.()) {
          navigation.goBack();
        }
      },
    })
  ).current;

  const followingKey = useMemo(
    () =>
      Array.isArray(currentUser?.following)
        ? currentUser.following.join('|')
        : '',
    [currentUser?.following]
  );

  const viewerBlockedList = useMemo(
    () => (Array.isArray(currentUser?.blocked) ? currentUser.blocked : []),
    [currentUser?.blocked]
  );
  const viewerBlockedByList = useMemo(
    () => (Array.isArray(currentUser?.blockedBy) ? currentUser.blockedBy : []),
    [currentUser?.blockedBy]
  );
  const otherBlocksViewer = useMemo(() => {
    if (!currentUser?.uid) return false;
    return Array.isArray(user?.blocked)
      ? user.blocked.includes(currentUser.uid)
      : false;
  }, [user?.blocked, currentUser?.uid]);
  const viewerBlocksTarget = useMemo(
    () => viewerBlockedList.includes(userId),
    [viewerBlockedList, userId]
  );
  const viewerIsBlocked = useMemo(
    () => viewerBlockedByList.includes(userId) || otherBlocksViewer,
    [viewerBlockedByList, userId, otherBlocksViewer]
  );
  const shouldHideProfile = useMemo(
    () =>
      currentUser?.uid !== userId && (viewerIsBlocked || viewerBlocksTarget),
    [currentUser?.uid, userId, viewerIsBlocked, viewerBlocksTarget]
  );

  useEffect(() => {
    const fetchUser = async () => {
      const data = await getUserData(userId);
      setUser(data);
      setIsFollowing(
        Array.isArray(currentUser?.following) &&
          currentUser.following.includes(userId)
      );
    };
    fetchUser();
  }, [userId, followingKey]);

  // Live-ish follower count using Firestore count() aggregate, updates when our following changes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!userId) return;
      try {
        const q = query(
          collection(db, 'users'),
          where('following', 'array-contains', userId)
        );
        const snap = await getDocs(q);
        if (!cancelled) setFollowerCountView(snap?.docs?.length ?? null);
      } catch (e) {
        if (!cancelled) setFollowerCountView(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [userId, followingKey]);

  useEffect(() => {
    async function fetchUserEventsAndHosts() {
      setLoadingEvents(true);
      if (!userId) {
        setUserEvents({ created: [], attending: [], attended: [] });
        setHostMap({});
        setLoadingEvents(false);
        return;
      }
      const userData = await getUserData(userId);

      const fetchEventsByIds = async (ids) => {
        if (!ids.length) return [];
        const eventsRef = collection(db, 'events');
        const chunks = [];
        for (let i = 0; i < ids.length; i += 30) {
          chunks.push(ids.slice(i, i + 30));
        }
        let results = [];
        for (const chunk of chunks) {
          const q = query(eventsRef, where('__name__', 'in', chunk));
          const snapshot = await getDocs(q);
          results = results.concat(
            snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          );
        }
        // Exclude soft-deleted
        return results.filter((e) => e.isDeleted !== true);
      };

      // Fetch by IDs (legacy arrays on user doc)
      const [createdIds, attendingIds, attendedIds] = await Promise.all([
        fetchEventsByIds(userData.createdEvents || []),
        fetchEventsByIds(userData.attendingEvents || []),
        fetchEventsByIds(userData.attendedEvents || []),
      ]);

      const eventsRef = collection(db, 'events');
      const [createdQSnap, attendingQSnap] = await Promise.all([
        getDocs(
          query(
            eventsRef,
            where('ownerId', '==', userId),
            where('isDeleted', '==', false)
          )
        ),
        getDocs(
          query(
            eventsRef,
            where('attendees', 'array-contains', userId),
            where('isDeleted', '==', false)
          )
        ),
      ]);

      const createdByQuery = createdQSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.isDeleted !== true);
      const attendingByQuery = attendingQSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.isDeleted !== true);

      // Merge uniquely
      const created = mergeUniqueEvents(createdIds, createdByQuery);
      const attending = mergeUniqueEvents(attendingIds, attendingByQuery);
      const attended = mergeUniqueEvents(attendedIds);

      let timelinePosts = [];
      try {
        const postsResult = await fetchInterestPostsByCreator({
          creatorId: userId,
          pageSize: 50,
        });
        timelinePosts = Array.isArray(postsResult?.posts)
          ? postsResult.posts
          : Array.isArray(postsResult)
          ? postsResult
          : [];
      } catch (err) {
        console.warn('Failed to load interest posts for other user', err);
      }

      setUserEvents({ created, attending, attended });
      setInterestPosts(
        timelinePosts.filter((post) => post?.isDeleted !== true)
      );

      // --- Batch fetch all unique ownerIds for host info ---
      const allEvents = [...created, ...attending, ...attended];
      const ownerIds = [
        ...new Set(allEvents.map((e) => e.ownerId).filter(Boolean)),
      ];
      const hostMapTemp = {};
      if (ownerIds.length) {
        try {
          const map = await ensureSnippets(ownerIds);
          ownerIds.forEach((id) => {
            const s = map.get(id);
            if (s) {
              // Normalize snippet fields to what downstream UI expects
              hostMapTemp[id] = {
                displayName: s.name,
                name: s.name,
                fullName: s.name,
                profileImage: s.photoURL,
                avatarURL: s.photoURL,
                rating: s.rating,
                verified: s.verified,
                uid: s.uid,
              };
            }
          });
        } catch (e) {
          // Fallback retained: if snippet ensure fails, do nothing; downstream will handle
          console.warn('Host snippet fetch failed', e?.message || e);
        }
      }
      setHostMap(hostMapTemp);
      setLoadingEvents(false);
    }
    fetchUserEventsAndHosts();
  }, [userId]);

  useEffect(() => {
    const checkSharedEvents = async () => {
      if (!currentUser || !userId) return;

      try {
        // Fetch events attended by the current user
        const currentUserEventsQuery = query(
          collection(db, 'events'),
          where('attendees', 'array-contains', currentUser.uid)
        );
        const currentUserEventsSnapshot = await getDocs(currentUserEventsQuery);
        const currentUserEventIds = currentUserEventsSnapshot.docs.map(
          (doc) => doc.id
        );

        // Fetch events attended by the profile user
        const profileUserEventsQuery = query(
          collection(db, 'events'),
          where('attendees', 'array-contains', userId)
        );
        const profileUserEventsSnapshot = await getDocs(profileUserEventsQuery);
        const profileUserEventIds = profileUserEventsSnapshot.docs.map(
          (doc) => doc.id
        );

        // Check for shared events
        const shared = currentUserEventIds.some((id) =>
          profileUserEventIds.includes(id)
        );
        setSharedEvents(shared);
      } catch (error) {
        console.error('Error checking shared events:', error);
        setSharedEvents(false);
      }
    };

    checkSharedEvents();
  }, [currentUser, userId]);

  const allEvents = mergeUniqueEvents(
    userEvents.created,
    userEvents.attending,
    userEvents.attended
  );

  // Filter: hide ended events unless current user was a member (host or attendee)
  const filteredEvents = allEvents.filter((ev) => {
    const endMs = getEventEndMs(ev);
    if (!endMs) return true; // keep if no time info
    const ended = Date.now() >= endMs;
    if (!ended) return true; // future or ongoing => keep
    const uid = currentUser?.uid;
    const isMember =
      (ev.ownerId && ev.ownerId === uid) ||
      (Array.isArray(ev.attendees) && ev.attendees.includes(uid));
    return isMember; // only keep ended events if viewer is host/attendee
  });

  const visibleEvents = filteredEvents.slice(0, visibleCount);

  const timelineItems = useMemo(() => {
    const eventItems = visibleEvents.map((event) => ({
      type: 'event',
      id: `event-${event.id}`,
      event,
    }));
    const postItems = (interestPosts || []).slice(0, 25).map((post) => ({
      type: 'post',
      id: `post-${post.id}`,
      post,
    }));
    const seen = new Set();
    return [...eventItems, ...postItems]
      .filter((item) => {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => getTimelineTimestamp(b) - getTimelineTimestamp(a));
  }, [visibleEvents, interestPosts]);

  const refreshProfiles = useCallback(async () => {
    try {
      if (currentUser?.uid) {
        await fetchCurrentUser(currentUser.uid);
      }
      if (userId) {
        const refreshed = await getUserData(userId);
        setUser(refreshed);
      }
    } catch (err) {
      console.warn('Failed to refresh profiles after block action:', err);
    }
  }, [currentUser?.uid, userId, fetchCurrentUser]);

  const confirmBlockUser = useCallback(() => {
    if (!currentUser?.uid || !userId) return;
    Alert.alert(
      'Block this user?',
      'They will no longer be able to view your profile or events, and you will stop seeing theirs.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setBlockBusy(true);
            try {
              await blockUserService(userId);
              await refreshProfiles();
              setIsFollowing(false);
              Alert.alert(
                'User blocked',
                'You will no longer see their activity.'
              );
            } catch (err) {
              console.error('Block failed:', err);
              Alert.alert('Error', 'Unable to block this user.');
            } finally {
              setBlockBusy(false);
            }
          },
        },
      ]
    );
  }, [currentUser?.uid, userId, refreshProfiles]);

  const confirmUnblockUser = useCallback(() => {
    if (!currentUser?.uid || !userId) return;
    Alert.alert(
      'Unblock this user?',
      'They will regain access to your public information and events.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            setBlockBusy(true);
            try {
              await unblockUserService(userId);
              await refreshProfiles();
              Alert.alert(
                'User unblocked',
                'You can interact with them again.'
              );
            } catch (err) {
              console.error('Unblock failed:', err);
              Alert.alert('Error', 'Unable to unblock this user.');
            } finally {
              setBlockBusy(false);
            }
          },
        },
      ]
    );
  }, [currentUser?.uid, userId, refreshProfiles]);

  const menuExtraActions = useMemo(() => {
    if (!currentUser?.uid || currentUser.uid === userId) return [];
    const label = blockBusy
      ? 'Updating...'
      : viewerBlocksTarget
      ? 'Unblock User'
      : 'Block User';
    return [
      {
        key: viewerBlocksTarget ? 'unblock-user' : 'block-user',
        label,
        onPress: viewerBlocksTarget ? confirmUnblockUser : confirmBlockUser,
        destructive: !viewerBlocksTarget,
        disabled: blockBusy,
      },
    ];
  }, [
    currentUser?.uid,
    userId,
    viewerBlocksTarget,
    confirmUnblockUser,
    confirmBlockUser,
    blockBusy,
  ]);

  if (!user) return null;

  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  const avatarURL =
    user.profileImage ||
    user.avatarURL ||
    'https://example.com/default-avatar.png';
  const rating = user.rating || 0;
  const ratingCount = user.ratingCount || 0;
  const verified = user.verified || false;
  const userSince =
    user.createdAt && typeof user.createdAt.toDate === 'function'
      ? user.createdAt
          .toDate()
          .toLocaleString('default', { month: 'short', year: 'numeric' })
      : '';
  const followerCount =
    typeof user.followerCount === 'number'
      ? user.followerCount
      : Array.isArray(user.followers)
      ? user.followers.length
      : 0;
  // Derived: prefer aggregate count if available
  const followerCountDisplay =
    typeof followerCountView === 'number' ? followerCountView : followerCount;

  const handleFollow = async () => {
    if (!currentUser || !user || currentUser.uid === userId) return;
    if (viewerBlocksTarget) {
      Alert.alert(
        'Unblock required',
        'Unblock this user before following them again.'
      );
      return;
    }
    if (viewerIsBlocked) {
      Alert.alert(
        'Action not allowed',
        'You cannot follow someone who has blocked you.'
      );
      return;
    }
    setRequestingFollow(true);
    try {
      await followUser(currentUser.uid, userId);
      setIsFollowing(true);
      // Optimistic: update local target profile count
      setUser((prev) => ({
        ...prev,
        followerCount: (prev?.followerCount || 0) + 1,
      }));
      // Optimistic: update global user store following array
      useUserStore.setState((state) => {
        if (!state.user) return state;
        const existing = Array.isArray(state.user.following)
          ? state.user.following
          : [];
        const next = Array.from(new Set([...existing, userId]));
        return { user: { ...state.user, following: next } };
      });
    } catch (err) {
      console.error('Follow failed:', err);
      Alert.alert('Error', 'Failed to follow user.');
      return;
    } finally {
      setRequestingFollow(false);
    }
    // Fire-and-forget notification (do not fail the follow UX)
    sendNotification('friend_request', userId, {
      fromUserId: currentUser.uid,
      fromUserName:
        `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() ||
        currentUser.displayName ||
        'Someone',
      message: `${
        currentUser.firstName || currentUser.displayName || 'Someone'
      } added you as a friend! Tap to view their profile.`,
      linkType: 'profile',
      linkId: currentUser.uid,
      read: false,
    }).catch((e) => {
      console.warn('Notification send failed (non-blocking):', e?.message || e);
    });
  };

  const handleUnfollow = async () => {
    if (!currentUser || !user || currentUser.uid === userId) return;
    setRequestingFollow(true);
    try {
      await unfollowUser(currentUser.uid, userId);
      setIsFollowing(false);
      // Optimistic local target profile count
      setUser((prev) => ({
        ...prev,
        followerCount: Math.max((prev?.followerCount || 1) - 1, 0),
      }));
      // Optimistic: update global user store following array
      useUserStore.setState((state) => {
        if (!state.user) return state;
        const existing = Array.isArray(state.user.following)
          ? state.user.following
          : [];
        const next = existing.filter((id) => id !== userId);
        return { user: { ...state.user, following: next } };
      });
    } catch (err) {
      console.error('Unfollow failed:', err);
      Alert.alert('Error', 'Failed to unfollow user.');
    } finally {
      setRequestingFollow(false);
    }
  };

  const onShare = async (item) => {
    if (!item) return;
    await shareEvent(item, {
      surface: 'profile',
      source: 'profile_timeline',
    });
  };

  const handleReport = () => {
    // Submit a user report via callable
    try {
      if (!currentUser?.uid || !userId) {
        Alert.alert('Report', 'Unable to report this profile right now.');
        setMenuVisible(false);
        return;
      }
      reportContent(currentUser.uid, userId, 'user', 'Inappropriate profile', {
        details: 'Report from OtherUserProfileScreen menu',
      })
        .then(() => {
          try {
            trackReportContent({
              content_type: 'user',
              content_id: userId,
              reason_category: 'inappropriate_profile',
              surface: 'profile',
            });
          } catch {}
          Alert.alert('Report', 'Thanks for the report.');
        })
        .catch(() => Alert.alert('Report', 'Failed to submit report.'))
        .finally(() => setMenuVisible(false));
    } catch {
      setMenuVisible(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await deleteEvent(eventId, user.uid);
      Alert.alert('Success', 'The event has been deleted.');
    } catch (error) {
      console.error('Error deleting event:', error);
      Alert.alert('Error', 'Failed to delete the event. Please try again.');
    } finally {
      setMenuVisible(false);
    }
  };

  const handleRateUser = async (rating) => {
    try {
      // Use callable directly to satisfy security rules and validate mutual events
      const fn = functions.httpsCallable('rateUser');
      await fn({ targetUid: userId, rating });

      // Fetch the updated user data after rating
      const updatedUser = await getUserData(userId);
      setUser(updatedUser);

      setRatingModalVisible(false);
      Alert.alert('Success', 'Rating updated successfully!');
    } catch (err) {
      console.error('Error rating user:', err);
      const msg = err?.message || 'Failed to rate user.';
      Alert.alert('Error', msg);
    }
  };

  // Proxy join press (kept for future customization); actual checks happen inside PostCard
  const handleJoinPress = () => {};

  const profileContent = (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <LinearGradient
          colors={['#4dabf7', '#ff6b6b']}
          style={styles.profileHeader}
        >
          <View style={styles.navBar}>
            <TouchableOpacity onPress={handleBackPress}>
              <Ionicons name='arrow-back' size={28} color='#fff' />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuVisible(true)}>
              <Ionicons name='ellipsis-horizontal' size={28} color='#fff' />
            </TouchableOpacity>
          </View>
          <View style={styles.avatarWrapper}>
            <Image source={{ uri: avatarURL }} style={styles.profileImage} />
            {verified && (
              <MaterialIcons
                name='verified'
                size={22}
                color='#fff'
                style={styles.verifiedBadge}
              />
            )}
          </View>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.since}>User since {userSince}</Text>
        </LinearGradient>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{followerCountDisplay}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {user.eventCount || allEvents.length}
            </Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          {rating > 0 && (
            <View style={styles.statCard}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <MaterialIcons name='star' size={20} color='#FFD700' />
                <Text style={styles.statValue}>{rating.toFixed(1)}</Text>
              </View>
              <Text style={styles.statLabel}>
                {`${ratingCount} rating${ratingCount !== 1 ? 's' : ''}`}
              </Text>
            </View>
          )}
        </View>

        {/* Follow/Unfollow and Rate User Buttons */}
        {currentUser?.uid !== userId && (
          <View style={styles.buttonRow}>
            {!viewerBlocksTarget && !viewerIsBlocked && (
              <TouchableOpacity
                style={[
                  styles.followButton,
                  { backgroundColor: isFollowing ? '#ccc' : '#007AFF' },
                ]}
                onPress={isFollowing ? handleUnfollow : handleFollow}
                disabled={requestingFollow}
              >
                <Text
                  style={[
                    styles.followButtonText,
                    { color: isFollowing ? '#333' : '#fff' },
                  ]}
                >
                  {requestingFollow
                    ? 'Processing...'
                    : isFollowing
                    ? 'Unfollow'
                    : 'Follow'}
                </Text>
              </TouchableOpacity>
            )}
            {sharedEvents && !viewerBlocksTarget && !viewerIsBlocked && (
              <TouchableOpacity
                style={[styles.followButton, { backgroundColor: '#FFD700' }]}
                onPress={() => setRatingModalVisible(true)}
              >
                <Text style={[styles.followButtonText, { color: '#333' }]}>
                  Rate User
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Bio */}
        {user.bio ? (
          <View style={styles.bioContainer}>
            <Text style={styles.bioText}>{user.bio}</Text>
          </View>
        ) : null}

        {/* Events */}
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineTitle}>{fullName}'s Timeline</Text>
        </View>
        {loadingEvents ? (
          <Text style={{ textAlign: 'center', marginTop: 20 }}>
            Loading timeline...
          </Text>
        ) : (
          timelineItems.map((item) => {
            if (item.type === 'post') {
              return (
                <InterestPostCard
                  key={item.id}
                  post={item.post}
                  enableInlineComposer={false}
                  onPress={() =>
                    navigation.navigate('InterestPost', {
                      postId: item.post.id,
                      initialPost: item.post,
                    })
                  }
                  onDeleted={(postId) =>
                    setInterestPosts((prev) =>
                      prev.filter((post) => post.id !== postId)
                    )
                  }
                />
              );
            }

            const event = item.event;
            // Description: Always show the actual event creator's info (name, image, rating)
            const ownerId = event.ownerId;
            const host = ownerId && hostMap[ownerId] ? hostMap[ownerId] : null;
            const hostName =
              host?.displayName ||
              host?.username ||
              host?.name ||
              host?.fullName ||
              `${host?.firstName || ''} ${host?.lastName || ''}`.trim() ||
              event.hostName ||
              (ownerId === userId
                ? `${user.firstName} ${user.lastName}`
                : 'Unknown Host');
            const hostPhoto =
              host?.profileImage ||
              host?.avatarURL ||
              event.hostPhoto ||
              (ownerId === userId ? user.profileImage || user.avatarURL : null);
            const hostRating =
              typeof host?.rating === 'number'
                ? host.rating
                : event.hostRating || (ownerId === userId ? user.rating : 0);

            const eventWithHost = {
              ...event,
              hostName,
              hostPhoto,
              hostRating,
              ownerId,
            };

            // Navigation handler: allow direct navigation if invoked from RSVP success
            const handleEventPress = (...args) => {
              if (eventWithHost.isDeleted) return;
              const uid = currentUser?.uid;
              const dest = args?.[1]; // PostCard passes 'EventChat' when RSVP flow succeeds

              if (dest === 'EventChat') {
                // RSVP succeeded -> go to chat
                navigation.navigate('EventChat', {
                  eventId: eventWithHost.id,
                  locationName:
                    eventWithHost.locationName || event.locationName || null,
                });
                return;
              }

              // Simple card tap: only members can open chat
              const isMember =
                (eventWithHost.ownerId && eventWithHost.ownerId === uid) ||
                (Array.isArray(event.attendees) &&
                  event.attendees.includes(uid));
              if (!isMember) {
                Alert.alert(
                  'No Access',
                  'You must be the host or an attendee to view this chat.'
                );
                return;
              }
              navigation.navigate('EventChat', {
                eventId: eventWithHost.id,
                locationName:
                  eventWithHost.locationName || event.locationName || null,
              });
            };

            return (
              <PostCard
                key={item.id}
                event={eventWithHost}
                onPress={handleEventPress}
                onJoinPress={handleJoinPress}
              />
            );
          })
        )}
      </ScrollView>
      <PopupMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        isOwner={false} // Adjust based on context
        onReport={handleReport}
        onDelete={handleDeleteEvent}
        targetType='user'
        extraActions={menuExtraActions}
      />
    </View>
  );

  const restrictedContent = (
    <View style={styles.blockedContainer}>
      <Text style={styles.blockedTitle}>You can’t view this profile</Text>
      <Text style={styles.blockedText}>
        {viewerBlocksTarget
          ? 'You blocked this user. Unblock them to reconnect.'
          : 'This user has blocked you. You can still block or report them from other screens if needed.'}
      </Text>
      <TouchableOpacity
        style={[
          styles.blockActionButton,
          blockBusy && styles.blockActionDisabled,
        ]}
        onPress={viewerBlocksTarget ? confirmUnblockUser : confirmBlockUser}
        disabled={blockBusy}
      >
        <Text style={styles.blockActionText}>
          {blockBusy
            ? 'Updating…'
            : viewerBlocksTarget
            ? 'Unblock User'
            : 'Block User'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const loadingContent = (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size='large' color='#007AFF' />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} {...panResponder.panHandlers}>
      {!user
        ? loadingContent
        : shouldHideProfile
        ? restrictedContent
        : profileContent}
    </SafeAreaView>
  );
}

// Description: Create theme-aware styles for OtherUserProfileScreen
const createStyles = (theme) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: { paddingBottom: 20 },
    profileHeader: {
      paddingBottom: 40,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
    },
    navBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 10,
    },
    avatarWrapper: {
      alignSelf: 'center',
      marginTop: 10,
      borderWidth: 3,
      borderColor: '#fff',
      borderRadius: 15,
      padding: 3,
      backgroundColor: '#fff',
    },
    profileImage: { width: 120, height: 120, borderRadius: 15 },
    verifiedBadge: { position: 'absolute', bottom: 0, right: 0 },
    name: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#fff',
      textAlign: 'center',
      marginTop: 6,
    },
    stat: { color: '#fff', fontSize: 15, textAlign: 'center', marginTop: 4 },
    since: { color: '#fff', fontSize: 13, textAlign: 'center', marginTop: 2 },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: -30,
      paddingHorizontal: 10,
    },
    statCard: {
      backgroundColor: theme.colors.card,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      alignItems: 'center',
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.1,
      shadowRadius: 4,
    },
    statValue: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
    statLabel: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 12,
    },
    followButton: {
      flex: 1,
      marginHorizontal: 5,
      paddingVertical: 10,
      borderRadius: 25,
      alignItems: 'center',
    },
    followButtonText: { fontWeight: 'bold', fontSize: 16 },
    bioContainer: {
      backgroundColor: theme.colors.card,
      marginTop: 16,
      marginHorizontal: 16,
      padding: 12,
      borderRadius: 10,
      elevation: 1,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.05,
      shadowRadius: 4,
    },
    bioText: { fontSize: 15, color: theme.colors.text },
    timelineHeader: { marginTop: 20, marginHorizontal: 16 },
    timelineTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    eventCard: {
      flexDirection: 'row',
      backgroundColor: theme.colors.card,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
      padding: 12,
      elevation: 2,
      position: 'relative',
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.05,
      shadowRadius: 4,
    },
    eventImage: {
      width: 70,
      height: 70,
      borderRadius: 10,
      marginRight: 10,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    eventInfo: { flex: 1 },
    eventTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 6,
      color: theme.colors.text,
    },
    pillRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    pill: {
      backgroundColor: theme.colors.backgroundSecondary,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    pillText: { fontSize: 12, color: theme.colors.textSecondary },
    eventLocation: { fontSize: 13, color: theme.colors.primary, marginTop: 2 },
    shareButton: {
      marginTop: 6,
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      paddingVertical: 5,
      paddingHorizontal: 12,
    },
    shareButtonText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
    blockedContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    blockedTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 12,
    },
    blockedText: {
      fontSize: 15,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 20,
    },
    blockActionButton: {
      backgroundColor: theme.colors.danger,
      paddingVertical: 12,
      paddingHorizontal: 28,
      borderRadius: 24,
    },
    blockActionDisabled: {
      opacity: 0.6,
    },
    blockActionText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 16,
    },
    blockAltButton: {
      backgroundColor: theme.colors.backgroundSecondary,
    },
    blockAltButtonText: {
      color: theme.colors.text,
      fontWeight: '600',
      fontSize: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
    },
    ratingModal: {
      backgroundColor: theme.colors.card,
      borderRadius: 16,
      padding: 24,
      width: '80%',
      alignItems: 'center',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 16,
      color: theme.colors.text,
    },
    starRow: {
      flexDirection: 'row',
      marginBottom: 10,
    },
    star: {
      fontSize: 36,
      marginHorizontal: 4,
    },
    selectedRatingText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 16,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginTop: 12,
    },
    cancelButton: {
      flex: 1,
      padding: 12,
      marginRight: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.backgroundSecondary,
      alignItems: 'center',
    },
    cancelButtonText: {
      color: theme.colors.text,
      fontWeight: '500',
    },
    submitButton: {
      flex: 1,
      padding: 12,
      marginLeft: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
    },
    submitButtonText: {
      color: '#fff',
      fontWeight: '600',
    },
  });
