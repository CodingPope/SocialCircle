// src/screens/Main/OtherUserProfileScreen.js
import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  Alert,
  Share,
  ScrollView, // <-- add ScrollView import
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getUserData, db } from '../../firebase/config';
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  Timestamp,
} from 'firebase/firestore'; // add Timestamp
import { useAuth } from '../../context/AuthContext';
import { updateUserData } from '../../firebase/config';
// Make sure addFriend and removeFriend are implemented and exported from '../../firebase/config'
import { addFriend, removeFriend } from '../../firebase/config';

export default function OtherUserProfileScreen({ route, navigation }) {
  // Assume route.params.userId is passed in
  const { userId } = route.params;
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [userEvents, setUserEvents] = useState({
    created: [],
    attending: [],
    attended: [],
  });
  const [loadingEvents, setLoadingEvents] = useState(true);
  const { user: currentUser } = useAuth(); // Get current logged-in user
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [requestingFollow, setRequestingFollow] = useState(false);

  useEffect(() => {
    // Fetch other user's data
    const fetchUser = async () => {
      const data = await getUserData(userId);
      setUser(data);
      setEvents(data.events || []);
    };
    fetchUser();
  }, [userId]);

  useEffect(() => {
    // Description: Check if current user is friends with this user
    if (user && currentUser) {
      setIsFollowing(
        Array.isArray(currentUser.friends) &&
          currentUser.friends.includes(userId)
      );
      setIsFollowedBy(
        Array.isArray(user.friends) && user.friends.includes(currentUser.uid)
      );
    }
  }, [user, currentUser, userId]);

  useEffect(() => {
    // Description: Fetch event objects for created (hosting/hosted), attending, and attended events from Firestore
    async function fetchUserEvents() {
      setLoadingEvents(true);
      if (!userId) {
        setUserEvents({ created: [], attending: [], attended: [] });
        setLoadingEvents(false);
        return;
      }
      const userData = await getUserData(userId);

      // createdEvents: events they've hosted or are hosting
      // attendingEvents: events they're currently attending
      // attendedEvents: events they've attended in the past
      const createdIds = Array.isArray(userData.createdEvents)
        ? userData.createdEvents
        : [];
      const attendingIds = Array.isArray(userData.attendingEvents)
        ? userData.attendingEvents
        : [];
      const attendedIds = Array.isArray(userData.attendedEvents)
        ? userData.attendedEvents
        : [];

      // Batch fetch events by IDs from Firestore
      const fetchEventsByIds = async (ids) => {
        if (!ids.length) return [];
        try {
          const eventsRef = collection(db, 'events');
          // Firestore 'in' query supports up to 30 items per query
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
        } catch (err) {
          console.warn(
            'Batch event fetch failed, falling back to events array',
            err
          );
          // Fallback: filter from events if available
          return events.filter((ev) => ids.includes(ev.id));
        }
      };

      const [created, attending, attended] = await Promise.all([
        fetchEventsByIds(createdIds),
        fetchEventsByIds(attendingIds),
        fetchEventsByIds(attendedIds),
      ]);

      setUserEvents({ created, attending, attended });
      setLoadingEvents(false);
    }
    fetchUserEvents();
  }, [userId, events]);

  // Merge and sort all events (hosting/hosted, attending, attended)
  const allEvents = mergeUniqueEvents(
    userEvents.created,
    userEvents.attending,
    userEvents.attended
  );

  // Lazy load: show first N events, load more on "Show More"
  const EVENTS_PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE);
  const visibleEvents = allEvents.slice(0, visibleCount);

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
  const eventsCount = Array.isArray(user.events)
    ? user.events.length
    : user.eventCount || 0;
  const bio = user.bio || '';
  const MAX_BIO_LENGTH = 100;

  // Show follower count (social proof)
  const followerCount =
    typeof user.followerCount === 'number'
      ? user.followerCount
      : Array.isArray(user.followers)
      ? user.followers.length
      : 0;

  // Popup actions
  const handleReport = () => {
    setMenuVisible(false);
    Alert.alert('Report User', 'Reporting functionality coming soon.');
  };

  // Determine if current user is following this user
  const isFollowingUser =
    Array.isArray(currentUser?.following) &&
    currentUser.following.includes(userId);

  // --- Add Friend logic ---
  const handleFollow = async () => {
    if (!currentUser || !user) return;
    setRequestingFollow(true);
    try {
      // Add userId to current user's following array
      await updateUserData(currentUser.uid, {
        following: Array.isArray(currentUser.following)
          ? [...currentUser.following, userId]
          : [userId],
      });
      // Increment target user's followerCount
      await updateUserData(userId, {
        followerCount: (user.followerCount || 0) + 1,
      });
      Alert.alert('Friend Added', `You are now following ${user.firstName}.`);
    } catch (err) {
      if (
        err.code === 'permission-denied' ||
        (err.message && err.message.includes('permission'))
      ) {
        Alert.alert(
          'Permission Error',
          'You can only update your own following list. If this is a mutual friend feature, each user must update their own profile separately.'
        );
      } else {
        Alert.alert('Error', 'Failed to follow user.');
      }
      console.error(err);
    } finally {
      setRequestingFollow(false);
    }
  };

  // --- Remove Friend logic ---
  const handleUnfollow = async () => {
    if (!currentUser || !user) return;
    setRequestingFollow(true);
    try {
      // Remove userId from current user's following array
      await updateUserData(currentUser.uid, {
        following: Array.isArray(currentUser.following)
          ? currentUser.following.filter((id) => id !== userId)
          : [],
      });
      // Decrement target user's followerCount
      await updateUserData(userId, {
        followerCount: Math.max((user.followerCount || 1) - 1, 0),
      });
      Alert.alert(
        'Friend Removed',
        `You are no longer following ${user.firstName}.`
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to unfollow user.');
      console.error(err);
    } finally {
      setRequestingFollow(false);
    }
  };

  // Helper to get unique events by id
  function mergeUniqueEvents(...eventArrays) {
    const map = new Map();
    eventArrays.flat().forEach((ev) => {
      if (ev && ev.id) map.set(ev.id, ev);
    });
    return Array.from(map.values());
  }

  // --- Share logic for event cards ---
  const onShare = async (item) => {
    try {
      await Share.share({
        message: `Join this event: ${item.title}\n\n${item.description}`,
      });
    } catch (err) {
      console.warn('Share error', err);
    }
  };

  // --- Render profile header ---
  const renderProfileHeader = () => (
    <>
      {/* Top nav with 3-dot menu */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name='arrow-back' size={28} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Ionicons name='ellipsis-horizontal' size={28} />
        </TouchableOpacity>
      </View>

      {/* Modal popup for settings */}
      <Modal
        visible={menuVisible}
        animationType='fade'
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPressOut={() => setMenuVisible(false)}
        >
          <View style={styles.popupMenu}>
            <Text style={styles.popupTitle}>Settings</Text>
            <TouchableOpacity style={styles.popupItem} onPress={handleReport}>
              <Text style={styles.popupText}>Report User</Text>
            </TouchableOpacity>
            {/* Add more options here */}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Profile Header Layout */}
      <View style={styles.header}>
        <View style={styles.avatarRow}>
          <Image source={{ uri: avatarURL }} style={styles.profileImage} />
        </View>
        <Text style={styles.name}>
          {fullName}
          {verified && (
            <MaterialIcons
              name='verified'
              size={20}
              color='black'
              style={styles.verifiedIcon}
            />
          )}
        </Text>
        <Text style={styles.stat}>
          {ratingCount === 0
            ? '☆☆☆☆☆ (Not yet rated)'
            : `${
                '★'.repeat(Math.floor(rating)) +
                '☆'.repeat(5 - Math.floor(rating))
              } (${ratingCount})`}
        </Text>
        <Text style={styles.since}>User since {userSince}</Text>

        {/* Card Row for Followers, Events, Badges */}
        <View style={styles.cardRow}>
          <View style={styles.cardItem}>
            <Text style={styles.cardValue}>{followerCount}</Text>
            <Text style={styles.cardLabel}>Friends</Text>
          </View>
          <View style={styles.cardItem}>
            <Text style={styles.cardValue}>{eventsCount}</Text>
            <Text style={styles.cardLabel}>Events</Text>
          </View>
          <View style={[styles.cardItem, { borderRightWidth: 0 }]}>
            <MaterialIcons
              name='star'
              size={32}
              color='#FFD700'
              style={styles.badgeIcon}
            />
            <Text style={styles.cardLabel}>Badges</Text>
          </View>
        </View>

        {/* Add Friend/Remove Friend Button */}
        {currentUser &&
          currentUser.uid !== userId &&
          (isFollowingUser ? (
            <TouchableOpacity
              style={[styles.addFriendButton, { backgroundColor: '#ccc' }]}
              onPress={handleUnfollow}
              disabled={requestingFollow}
            >
              <Text style={[styles.addFriendText, { color: '#333' }]}>
                {requestingFollow ? 'Adding...' : 'Remove Friend'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.addFriendButton}
              onPress={handleFollow}
              disabled={requestingFollow}
            >
              <Text style={styles.addFriendText}>
                {requestingFollow ? 'Removing...' : 'Add Friend'}
              </Text>
            </TouchableOpacity>
          ))}
        <View style={styles.bioContainer}>
          <Text style={styles.bioText}>
            {bio.length > MAX_BIO_LENGTH
              ? bio.slice(0, MAX_BIO_LENGTH) + '...'
              : bio}
          </Text>
        </View>
      </View>
      {/* Timeline Section Header */}
      <View style={styles.timelineHeader}>
        <Text style={styles.timelineTitle}>Event Timeline</Text>
      </View>
    </>
  );

  // --- Render each event card ---
  const renderEventItem = ({ item }) => {
    // Description: Determine event role for user based on createdEvents and attendedEvents arrays
    let role = '';
    const now = new Date();
    // Use item.date as the main event time
    let eventDate = null;
    if (item.date) {
      if (item.date.toDate) eventDate = item.date.toDate();
      else if (item.date instanceof Date) eventDate = item.date;
      else if (typeof item.date === 'object' && item.date.seconds)
        eventDate = new Date(item.date.seconds * 1000);
    }
    const isUpcoming = eventDate ? eventDate >= now : false;

    // Get user's event arrays for role logic
    const createdEventsArr = Array.isArray(user.createdEvents)
      ? user.createdEvents
      : [];
    const attendedEventsArr = Array.isArray(user.attendedEvents)
      ? user.attendedEvents
      : [];

    // Only use createdEvents and attendedEvents for role
    if (createdEventsArr.includes(item.id)) {
      role = isUpcoming ? 'Hosting' : 'Hosted';
    } else if (attendedEventsArr.includes(item.id)) {
      role = isUpcoming ? 'Attending' : 'Attended';
    } else {
      role = isUpcoming ? 'Attending' : 'Attended';
    }

    // Description: Use event image or exclude image section if none exists
    const imageUrl = item.imageURL || item.imageUri || item.imageUrl || null;

    // --- Date/time logic ---
    let eventDateTime = '';
    if (item.date) {
      // Firestore Timestamp object
      if (item.date.toDate) {
        eventDateTime = item.date.toDate().toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      // JS Date object
      else if (item.date instanceof Date) {
        eventDateTime = item.date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      // Timestamp as seconds
      else if (typeof item.date === 'object' && item.date.seconds) {
        eventDateTime = new Date(item.date.seconds * 1000).toLocaleString(
          undefined,
          {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }
        );
      }
    } else if (item.startAt) {
      // Firestore Timestamp object
      if (item.startAt.toDate) {
        eventDateTime = item.startAt.toDate().toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      // JS Date object
      else if (item.startAt instanceof Date) {
        eventDateTime = item.startAt.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      // Timestamp as seconds
      else if (typeof item.startAt === 'object' && item.startAt.seconds) {
        eventDateTime = new Date(item.startAt.seconds * 1000).toLocaleString(
          undefined,
          {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }
        );
      }
    }

    // --- Location logic ---
    let cityState = '';
    if (item.location) {
      // Firestore location object
      if (item.location.city && item.location.state) {
        cityState = `${item.location.city}, ${item.location.state}`;
      }
      // Address string
      else if (typeof item.location === 'string') {
        const parts = item.location.split(',');
        if (parts.length >= 2) {
          cityState = `${parts[parts.length - 2].trim()}, ${parts[
            parts.length - 1
          ].trim()}`;
        } else {
          cityState = item.location.trim();
        }
      }
      // Nested address string
      else if (item.location.address) {
        const addrParts = item.location.address.split(',');
        if (addrParts.length >= 2) {
          cityState = `${addrParts[addrParts.length - 2].trim()}, ${addrParts[
            addrParts.length - 1
          ].trim()}`;
        } else {
          cityState = item.location.address.trim();
        }
      }
      // Lat/lng object (optional: show "Location available")
      else if (item.location.latitude && item.location.longitude) {
        cityState = 'Location available';
      }
    }

    // --- Attendee count ---
    const attendeeCount = Array.isArray(item.attendees)
      ? item.attendees.length
      : 0;

    return (
      <View key={item.id} style={styles.eventCard}>
        {imageUrl && (
          <Image source={{ uri: imageUrl }} style={styles.eventImage} />
        )}
        <TouchableOpacity style={styles.ellipsisButtonAbsolute}>
          <Text style={styles.ellipsisText}>•••</Text>
        </TouchableOpacity>
        <View style={styles.eventInfo}>
          <View style={styles.eventInfoHeader}>
            <Text style={styles.eventRole}>{role}</Text>
          </View>
          <Text style={styles.eventTitle}>{item.title}</Text>
          <View style={styles.eventMetaRow}>
            <Text style={styles.eventDate}>{eventDateTime}</Text>
            {cityState ? (
              <Text style={styles.eventLocation}>{cityState}</Text>
            ) : null}
          </View>
          <Text style={styles.eventAttendees}>{attendeeCount} attending</Text>
          {/* Share Button in bottom right */}
          <View style={styles.eventCardFooter}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => onShare(item)}
            >
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // --- Show More Button ---
  const renderFooter = () =>
    visibleCount < allEvents.length ? (
      <TouchableOpacity
        style={styles.showMoreButton}
        onPress={() => setVisibleCount((c) => c + EVENTS_PAGE_SIZE)}
      >
        <Text style={styles.showMoreText}>Show More</Text>
      </TouchableOpacity>
    ) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={loadingEvents ? [] : visibleEvents}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderProfileHeader}
        renderItem={renderEventItem}
        ListFooterComponent={
          loadingEvents ? (
            <View style={{ alignItems: 'center', marginTop: 32 }}>
              <Text>Loading events...</Text>
            </View>
          ) : (
            renderFooter
          )
        }
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 12,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  avatarRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  profileImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 4,
    textAlign: 'center',
  },
  verifiedIcon: {
    marginLeft: 6,
  },
  stat: {
    fontSize: 16,
    color: '#222',
    marginTop: 2,
    textAlign: 'center',
  },
  since: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  cardItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    borderRightWidth: 1,
    borderColor: '#eee',
    justifyContent: 'center',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 2,
  },
  cardLabel: {
    fontSize: 15,
    color: '#444',
    fontWeight: '500',
    textAlign: 'center',
  },
  badgeIcon: {
    marginBottom: 2,
  },
  addFriendButton: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
    marginTop: 12,
    marginBottom: 8,
  },
  addFriendText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  bioContainer: {
    backgroundColor: '#f0f0f0',
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    width: '100%',
  },
  bioText: {
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#ddd',
  },
  tabButton: { paddingVertical: 12 },
  tabButtonActive: { borderBottomWidth: 2, borderColor: '#000' },
  tabText: { color: '#666' },
  tabTextActive: { color: '#000', fontWeight: 'bold' },
  list: { paddingBottom: 16 },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  eventImagePlaceholder: {
    width: 50,
    height: 50,
    backgroundColor: '#ddd',
    borderRadius: 4,
    marginRight: 12,
  },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 16, fontWeight: '600' },
  eventDetails: { color: '#666', marginTop: 4 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  popupMenu: {
    backgroundColor: '#fff',
    padding: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 5,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  popupItem: {
    paddingVertical: 12,
  },
  popupText: {
    fontSize: 16,
    color: '#0066cc',
  },
  timelineHeader: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f9f9f9',
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  timelineTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  eventImage: {
    width: 60,
    height: 60,
    borderRadius: 4,
    marginRight: 12,
  },
  eventInfo: { flex: 1 },
  eventRole: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  eventMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    color: '#333',
  },
  eventLocation: {
    fontSize: 14,
    color: '#0066cc',
  },
  eventAttendees: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  eventCardFooter: {
    marginTop: 8,
    alignItems: 'flex-end',
    width: '100%',
  },
  shareButton: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  showMoreButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
    marginTop: 12,
    marginBottom: 8,
    alignSelf: 'center',
  },
  showMoreText: {
    color: '#0066cc',
    fontWeight: 'bold',
    fontSize: 16,
  },
  ellipsisButtonAbsolute: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 8,
  },
  ellipsisText: {
    fontSize: 18,
    color: '#333',
  },
});
