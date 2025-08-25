import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Share,
  ScrollView,
  StatusBar,
  Platform,
  PanResponder,
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
} from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  getCountFromServer,
} from 'firebase/firestore';
import { useUserStore } from '../profile/userStore';
import { useUserSnippetStore } from '../profile/userSnippetStore';
import PopupMenu from './PopupMenu';
import PostCard from './PostCard';
import { trackShareEvent, trackReportContent } from '../../lib/analytics';

function mergeUniqueEvents(...eventArrays) {
  const map = new Map();
  eventArrays.flat().forEach((ev) => {
    if (ev && ev.id) map.set(ev.id, ev);
  });
  return Array.from(map.values()).sort((a, b) => {
    const getDate = (e) =>
      e.date?.toDate
        ? e.date.toDate()
        : new Date(e.date?.seconds ? e.date.seconds * 1000 : e.date);
    return getDate(b) - getDate(a); // Sort from future to past
  });
}

export default function OtherUserProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const [user, setUser] = useState(null);
  const [userEvents, setUserEvents] = useState({
    created: [],
    attending: [],
    attended: [],
  });
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [hostMap, setHostMap] = useState({}); // Map of ownerId -> user info
  // Description: Get current user from Zustand userStore
  const currentUser = useUserStore((state) => state.user);
  const setUserStore = useUserStore((state) => state.setUser);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCountView, setFollowerCountView] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [selectedRating, setSelectedRating] = useState(0);
  const [requestingFollow, setRequestingFollow] = useState(false);
  const [sharedEvents, setSharedEvents] = useState(false); // Track if shared events exist
  const [ratingModalVisible, setRatingModalVisible] = useState(false); // Modal for rating

  // Swipe right to go back (full-screen gesture)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
        // Engage for predominantly horizontal rightward gestures
        return Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) && dx > 0;
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx } = gestureState;
        const distancePass = dx > 60;
        const velocityPass = vx > 0.35;
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
        const snap = await getCountFromServer(q);
        if (!cancelled) setFollowerCountView(snap?.data()?.count ?? null);
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

      setUserEvents({ created, attending, attended });

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

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`;
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

  const allEvents = mergeUniqueEvents(
    userEvents.created,
    userEvents.attending,
    userEvents.attended
  );

  // Helper: compute event end time; prefer endAt; fallback to date+1h
  const getEventEndMs = (ev) => {
    if (!ev) return null;
    let endMs = null;
    if (ev.endAt) {
      if (ev.endAt.toDate) endMs = ev.endAt.toDate().getTime();
      else if (typeof ev.endAt.seconds === 'number')
        endMs = ev.endAt.seconds * 1000;
    } else if (ev.date) {
      if (ev.date.toDate) endMs = ev.date.toDate().getTime();
      else if (typeof ev.date.seconds === 'number')
        endMs = ev.date.seconds * 1000;
      else if (ev.date instanceof Date) endMs = ev.date.getTime();
      if (endMs) endMs += 60 * 60 * 1000; // assume 1h duration if only start date is present
    }
    return endMs;
  };

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

  const handleFollow = async () => {
    if (!currentUser || !user || currentUser.uid === userId) return;
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
    try {
      await sendNotification('friend_request', userId, {
        fromUserId: currentUser.uid,
        fromUserName:
          `${currentUser.firstName || ''} ${
            currentUser.lastName || ''
          }`.trim() ||
          currentUser.displayName ||
          'Someone',
        message: `${
          currentUser.firstName || currentUser.displayName || 'Someone'
        } added you as a friend! Tap to view their profile.`,
        linkType: 'profile',
        linkId: currentUser.uid,
        read: false,
      });
    } catch (e) {
      console.warn('Notification send failed (non-blocking):', e?.message || e);
    }
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
    try {
      await Share.share({
        message: `Join this event: ${item.title}\n\n${item.description}`,
      });
      try {
        trackShareEvent({
          event_id: item?.id || '',
          channel: 'native_share',
          source: 'profile',
          surface: 'profile',
        });
      } catch {}
    } catch {}
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
      const fn = httpsCallable(functions, 'rateUser');
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

  return (
    <SafeAreaView style={styles.safe} {...panResponder.panHandlers}>
      {/* Rating Modal */}
      {ratingModalVisible && (
        <Modal
          visible={ratingModalVisible}
          transparent
          animationType='slide'
          onRequestClose={() => setRatingModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.ratingModal}>
              <Text style={styles.modalTitle}>Rate {fullName}</Text>

              {/* ⭐ Star Row */}
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setSelectedRating(star)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.star,
                        {
                          color: star <= selectedRating ? '#FFD700' : '#ccc',
                        },
                      ]}
                    >
                      ★
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ✅ Rating Value (optional) */}
              {selectedRating > 0 && (
                <Text style={styles.selectedRatingText}>
                  {selectedRating} out of 5
                </Text>
              )}

              {/* ✅ Buttons */}
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  onPress={() => setRatingModalVisible(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    handleRateUser(selectedRating);
                    setRatingModalVisible(false);
                  }}
                  style={styles.submitButton}
                  disabled={selectedRating === 0}
                >
                  <Text style={styles.submitButtonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        {...panResponder.panHandlers}
      >
        {/* Header */}
        <LinearGradient
          colors={['#4DA0B0', '#D39D38']}
          style={styles.profileHeader}
        >
          <View style={styles.navBar}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
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
          <Text style={styles.stat}>
            {ratingCount === 0
              ? '☆☆☆☆☆ (Not yet rated)'
              : `${
                  '★'.repeat(Math.floor(rating)) +
                  '☆'.repeat(5 - Math.floor(rating))
                } (${ratingCount})`}
          </Text>
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
          <View style={styles.statCard}>
            <MaterialIcons name='star' size={28} color='#FFD700' />
            <Text style={styles.statLabel}>Badges</Text>
          </View>
        </View>

        {/* Follow/Unfollow and Rate User Buttons */}
        {currentUser?.uid !== userId && (
          <View style={styles.buttonRow}>
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
            {sharedEvents && (
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
          <Text style={styles.timelineTitle}>{fullName}'s Events</Text>
        </View>
        {loadingEvents ? (
          <Text style={{ textAlign: 'center', marginTop: 20 }}>
            Loading events...
          </Text>
        ) : (
          visibleEvents.map((event) => {
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
              const dest = args?.[1]; // PostCard passes 'EventChatScreen' when RSVP flow succeeds

              if (dest === 'EventChatScreen') {
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
                key={event.id}
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
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, // Add padding for Android
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
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 3,
  },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 13, color: '#777', marginTop: 4 },
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
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    elevation: 1,
  },
  bioText: { fontSize: 15, color: '#333' },
  timelineHeader: { marginTop: 20, marginHorizontal: 16 },
  timelineTitle: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    elevation: 2,
    position: 'relative',
  },
  eventImage: { width: 70, height: 70, borderRadius: 10, marginRight: 10 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  pill: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  pillText: { fontSize: 12, color: '#555' },
  eventLocation: { fontSize: 13, color: '#007AFF', marginTop: 2 },
  shareButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  shareButtonText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
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
    color: '#666',
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
    backgroundColor: '#eee',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: '500',
  },
  submitButton: {
    flex: 1,
    padding: 12,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
