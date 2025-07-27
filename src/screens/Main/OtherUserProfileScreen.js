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
} from '../../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import PopupMenu from '../../components/PopupMenu'; // Import the PopupMenu component

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
  const { user: currentUser } = useAuth();
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
    async function fetchUserEvents() {
      setLoadingEvents(true);
      if (!userId) {
        setUserEvents({ created: [], attending: [], attended: [] });
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
        return results;
      };

      const [created, attending, attended] = await Promise.all([
        fetchEventsByIds(userData.createdEvents || []),
        fetchEventsByIds(userData.attendingEvents || []),
        fetchEventsByIds(userData.attendedEvents || []),
      ]);
      setUserEvents({ created, attending, attended });
      setLoadingEvents(false);
    }
    fetchUserEvents();
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
  const visibleEvents = allEvents.slice(0, visibleCount);

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

  const handleDeleteEvent = () => {
    Alert.alert('Delete Event functionality coming soon.');
    setMenuVisible(false);
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
            const now = new Date();
            const isPastEvent = event.date?.seconds
              ? new Date(event.date.seconds * 1000) < now
              : false;

            const role = isPastEvent
              ? user.createdEvents?.includes(event.id)
                ? 'Hosted'
                : 'Attended'
              : user.createdEvents?.includes(event.id)
              ? 'Hosting'
              : 'Attending';

            const eventDate = event.date?.seconds
              ? new Date(event.date.seconds * 1000).toLocaleDateString()
              : 'Date not available';

            return (
              <View key={event.id} style={styles.eventCard}>
                {event.imageUrl && (
                  <Image
                    source={{ uri: event.imageUrl }}
                    style={styles.eventImage}
                  />
                )}
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <View style={styles.pillRow}>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{role}</Text>
                    </View>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{eventDate}</Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: '#E8F5E9' }]}>
                      <Text style={[styles.pillText, { color: '#388E3C' }]}>
                        {event.attendees?.length || 0} Attending
                      </Text>
                    </View>
                  </View>
                  {event.location?.address && (
                    <Text style={styles.eventLocation}>
                      {event.location.address}
                    </Text>
                  )}
                  <TouchableOpacity
                    style={styles.shareButton}
                    onPress={() => onShare(event)}
                  >
                    <Text style={styles.shareButtonText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
