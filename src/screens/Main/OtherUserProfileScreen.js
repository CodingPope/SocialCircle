import React, { useState, useEffect } from 'react';
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
} from '../../firebase/config';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from 'firebase/firestore';
import { useUserStore } from '../../store/userStore';
import PopupMenu from '../../components/PopupMenu'; // Import the PopupMenu component
import PostCard from '../../components/PostCard'; // Import the PostCard component

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
  const [isFollowing, setIsFollowing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [selectedRating, setSelectedRating] = useState(0);
  const [requestingFollow, setRequestingFollow] = useState(false);
  const [sharedEvents, setSharedEvents] = useState(false); // Track if shared events exist
  const [ratingModalVisible, setRatingModalVisible] = useState(false); // Modal for rating

  useEffect(() => {
    const fetchUser = async () => {
      const data = await getUserData(userId);
      setUser(data);
      if (currentUser?.following?.includes(userId)) {
        setIsFollowing(true);
      }
    };
    fetchUser();
  }, [userId, currentUser]);

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
        // Batch in chunks of 10 (Firestore limitation)
        for (let i = 0; i < ownerIds.length; i += 10) {
          const chunk = ownerIds.slice(i, i + 10);
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('__name__', 'in', chunk));
          const snap = await getDocs(q);
          snap.docs.forEach((docSnap) => {
            hostMapTemp[docSnap.id] = docSnap.data();
          });
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
    if (!currentUser || !user) return;
    setRequestingFollow(true);
    try {
      await updateUserData(currentUser.uid, {
        following: Array.isArray(currentUser.following)
          ? [...currentUser.following, userId]
          : [userId],
      });
      await updateUserData(userId, {
        followerCount: (user.followerCount || 0) + 1,
      });
      // Send notification to the user being followed
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
      setIsFollowing(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to follow user.');
    } finally {
      setRequestingFollow(false);
    }
  };

  const handleUnfollow = async () => {
    if (!currentUser || !user) return;
    setRequestingFollow(true);
    try {
      await updateUserData(currentUser.uid, {
        following: Array.isArray(currentUser.following)
          ? currentUser.following.filter((id) => id !== userId)
          : [],
      });
      await updateUserData(userId, {
        followerCount: Math.max((user.followerCount || 1) - 1, 0),
      });
      setIsFollowing(false);
    } catch (err) {
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
    } catch {}
  };

  const handleReport = () => {
    Alert.alert('Report User functionality coming soon.');
    setMenuVisible(false);
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
      await updateUserRating(userId, currentUser.uid, rating);

      // Fetch the updated user data after rating
      const updatedUser = await getUserData(userId);
      setUser(updatedUser);

      setRatingModalVisible(false);
      Alert.alert('Success', 'Rating updated successfully!');
    } catch (err) {
      console.error('Error rating user:', err);
      Alert.alert('Error', 'Failed to rate user.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
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

      <ScrollView contentContainerStyle={styles.scrollContent}>
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
            <Text style={styles.statValue}>{followerCount}</Text>
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
                onJoinPress={() => {}}
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
