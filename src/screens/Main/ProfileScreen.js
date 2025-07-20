// src/screens/Main/ProfileScreen.js
import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Share,
  Modal,
  Alert,
  TextInput,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { signOut } from 'firebase/auth';
import {
  auth,
  getUserData,
  updateUserData,
  uploadProfileImage,
  db,
} from '../../firebase/config';
import { useMyEvents } from '../../hooks/useMyEvents';
import * as ImagePicker from 'expo-image-picker';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { GOOGLE_MAPS_API_KEY } from '@env';

// Helper: Merge unique events and sort by startAt descending
function mergeUniqueEvents(...eventArrays) {
  const map = new Map();
  eventArrays.flat().forEach((ev) => {
    if (ev && ev.id) map.set(ev.id, ev);
  });
  return Array.from(map.values()).sort((a, b) => {
    const getDate = (e) =>
      e.startAt?.toDate
        ? e.startAt.toDate()
        : new Date(e.startAt?.seconds ? e.startAt.seconds * 1000 : e.startAt);
    return getDate(b) - getDate(a);
  });
}

export default function ProfileScreen({ navigation }) {
  const { user } = useAuth();
  const myEvents = useMyEvents(user?.uid || '');
  const now = new Date();

  // --- State ---
  const [showFullBio, setShowFullBio] = useState(false);
  const MAX_BIO_LENGTH = 100;
  const [bio, setBio] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [ratingCount, setRatingCount] = useState(0);
  const [rating, setRating] = useState(0);
  const [verified, setVerified] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userEvents, setUserEvents] = useState({
    created: [],
    attending: [],
    attended: [],
  });
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [groupEvents, setGroupEvents] = useState([]);
  const EVENTS_PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE);
  // --- Add: Track logout state ---
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isPrivate, setIsPrivate] = useState(user.isPrivate || false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // --- Derived ---
  const fullName = `${user.firstName} ${user.lastName}`;
  const avatarURL = user.avatarURL || 'https://example.com/default-avatar.png';
  const userSince =
    user.createdAt && typeof user.createdAt.toDate === 'function'
      ? user.createdAt
          .toDate()
          .toLocaleString('default', { month: 'short', year: 'numeric' })
      : '';
  const friendCount = Array.isArray(user.friends) ? user.friends.length : 0;
  const followerCount =
    typeof user.followerCount === 'number'
      ? user.followerCount
      : Array.isArray(user.followers)
      ? user.followers.length
      : 0;
  const eventCount =
    (Array.isArray(user.createdEvents) ? user.createdEvents.length : 0) +
    (Array.isArray(user.attendedEvents) ? user.attendedEvents.length : 0);

  // --- Refresh handler ---
  const onRefresh = useCallback(async () => {
    if (!user?.uid || isLoggingOut) return; // Prevent fetch after logout
    setRefreshing(true);
    const data = await getUserData(user.uid);
    setBio(data.bio || '');
    setProfileImage(data.profileImage || null);
    setRating(data.rating || 0);
    setRatingCount(data.ratingCount || 0);
    setVerified(data.verified || false);
    setRefreshing(false);
  }, [user?.uid, isLoggingOut]);

  useEffect(() => {
    // Fetch user data on mount
    let isMounted = true;
    const fetchUserData = async () => {
      if (!user?.uid || isLoggingOut) return;
      const data = await getUserData(user.uid);
      if (!isMounted) return;
      setBio(data.bio || '');
      setProfileImage(data.profileImage || null);
      setRating(data.rating || 0);
      setRatingCount(data.ratingCount || 0);
      setVerified(data.verified || false);
    };
    fetchUserData();
    return () => {
      isMounted = false;
    };
  }, [user?.uid, isLoggingOut]);

  useEffect(() => {
    // Fetch event objects for created, attending, attended events
    let isMounted = true;
    async function fetchUserEvents() {
      setLoadingEvents(true);
      if (!user?.uid || isLoggingOut) {
        if (isMounted)
          setUserEvents({ created: [], attending: [], attended: [] });
        if (isMounted) setLoadingEvents(false);
        return;
      }
      const userData = await getUserData(user.uid);
      const fetchEventsByIds = async (ids) => {
        if (!ids.length) return [];
        try {
          const eventsRef = collection(db, 'events');
          const chunks = [];
          for (let i = 0; i < ids.length; i += 30)
            chunks.push(ids.slice(i, i + 30));
          let results = [];
          for (const chunk of chunks) {
            const q = query(eventsRef, where('__name__', 'in', chunk));
            const snapshot = await getDocs(q);
            results = results.concat(
              snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            );
          }
          return results;
        } catch {
          return myEvents.filter((ev) => ids.includes(ev.id));
        }
      };
      const [created, attending, attended] = await Promise.all([
        fetchEventsByIds(userData.createdEvents || []),
        fetchEventsByIds(userData.attendingEvents || []),
        fetchEventsByIds(userData.attendedEvents || []),
      ]);
      if (isMounted) setUserEvents({ created, attending, attended });
      if (isMounted) setLoadingEvents(false);
    }
    fetchUserEvents();
    return () => {
      isMounted = false;
    };
  }, [user?.uid, myEvents, isLoggingOut]);

  useEffect(() => {
    // Fetch events from groups the user is a member of
    let isMounted = true;
    async function fetchGroupEvents() {
      if (!user?.groups?.length || isLoggingOut) {
        if (isMounted) setGroupEvents([]);
        return;
      }
      try {
        const groupsRef = collection(db, 'groups');
        const groupChunks = [];
        for (let i = 0; i < user.groups.length; i += 30)
          groupChunks.push(user.groups.slice(i, i + 30));
        let allGroupEvents = [];
        for (const chunk of groupChunks) {
          const q = query(groupsRef, where('__name__', 'in', chunk));
          const snapshot = await getDocs(q);
          for (const doc of snapshot.docs) {
            const groupData = doc.data();
            if (Array.isArray(groupData.events) && groupData.events.length) {
              const eventsRef = collection(db, 'events');
              for (let i = 0; i < groupData.events.length; i += 30) {
                const eventChunk = groupData.events.slice(i, i + 30);
                const eq = query(
                  eventsRef,
                  where('__name__', 'in', eventChunk)
                );
                const eventSnap = await getDocs(eq);
                allGroupEvents = allGroupEvents.concat(
                  eventSnap.docs.map((evDoc) => ({
                    id: evDoc.id,
                    ...evDoc.data(),
                  }))
                );
              }
            }
          }
        }
        if (isMounted) setGroupEvents(allGroupEvents);
      } catch {
        if (isMounted) setGroupEvents([]);
      }
    }
    fetchGroupEvents();
    return () => {
      isMounted = false;
    };
  }, [user?.groups, isLoggingOut]);

  // --- Timeline events ---
  const allEvents = mergeUniqueEvents(
    userEvents.created,
    userEvents.attending,
    userEvents.attended,
    groupEvents
  );
  const visibleEvents = allEvents.slice(0, visibleCount);

  // --- Handlers ---
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true); // Prevent further fetches
      await signOut(auth);
      // Delay navigation to ensure all listeners cleanup
      setTimeout(() => {
        navigation.replace('Auth');
      }, 100); // 100ms is enough for cleanup
    } catch (err) {
      setIsLoggingOut(false);
      Alert.alert('Logout failed', err.message);
    }
  };

  const handleImageUpload = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        alert('Permission to access the photo library is required!');
        return;
      }
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (pickerResult.canceled) {
        alert('No image selected.');
        return;
      }
      const imageUri = pickerResult.assets[0].uri;
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const newImage = await uploadProfileImage(user.uid, blob);
      if (newImage) {
        await updateUserData(user.uid, { profileImage: newImage });
        setProfileImage(newImage);
        alert('Profile image updated successfully!');
      } else {
        alert('Failed to upload image.');
      }
    } catch {
      alert('Failed to update profile image. Please try again.');
    }
  };

  const handleSaveChanges = async () => {
    await updateUserData(user.uid, { bio });
    setIsEditing(false);
    alert('Changes saved successfully!');
  };

  const onShare = async (item) => {
    try {
      await Share.share({
        message: `Join my event: ${item.title}\n\n${item.description}`,
      });
    } catch {}
  };

  const handleEllipsisClick = (event) => {
    setSelectedEvent(event);
    setModalVisible(true);
  };

  const handleDeleteEvent = () => {
    // Description: Stub for deleting event logic
    alert('Delete Event functionality coming soon.');
    setModalVisible(false);
  };

  const handleRemoveEvent = () => {
    // Description: Stub for removing event from timeline logic
    alert('Remove Event functionality coming soon.');
    setModalVisible(false);
  };

  // --- Render ---
  return (
    <SafeAreaView style={styles.safe}>
      {/* Modal for ellipsis options */}
      <Modal
        visible={modalVisible}
        animationType='slide'
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPressOut={() => setModalVisible(false)} // Close modal when clicking overlay
        >
          <View style={styles.modalContent}>
            {selectedEvent &&
            (selectedEvent.ownerId === user?.uid ||
              selectedEvent.ownerID === user?.uid) ? (
              <TouchableOpacity
                style={styles.modalOption}
                onPress={handleDeleteEvent}
              >
                <Text style={styles.modalOptionText}>Delete Event</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.modalOption}
                onPress={handleRemoveEvent}
              >
                <Text style={styles.modalOptionText}>Remove Event</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalOptionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sidebar Modal */}
      <Modal
        visible={menuVisible}
        animationType='slide' // Slide up animation for modal
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPressOut={() => setMenuVisible(false)} // Close modal when clicking overlay
        >
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => setIsEditing(true)}
            >
              <Text style={styles.modalOptionText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleLogout}>
              <Text style={styles.modalOptionText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Top nav */}
      <View style={styles.navBar}>
        <Text style={styles.navTitle}>Profile</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            style={{ marginRight: 16 }}
            accessibilityLabel='Notifications'
          >
            <MaterialCommunityIcons name='bell-outline' size={28} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuVisible(true)}>
            <Ionicons name='menu' size={28} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.divider} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={isEditing ? handleImageUpload : null}>
              <Image
                source={{ uri: profileImage || avatarURL }}
                style={styles.profileImage}
              />
            </TouchableOpacity>
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
          <View style={styles.cardRow}>
            <View style={styles.cardItem}>
              <Text style={styles.cardValue}>{followerCount}</Text>
              <Text style={styles.cardLabel}>Friends</Text>
            </View>
            <View style={styles.cardItem}>
              <Text style={styles.cardValue}>{eventCount}</Text>
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
          {/* Remove privacy toggle and followers/following counts */}
          <View style={styles.bioContainer}>
            <TextInput
              style={[
                styles.bioInput,
                isEditing && styles.bioInputEditing,
                styles.bioText,
              ]}
              value={bio}
              onChangeText={setBio}
              editable={isEditing}
              placeholder='Write your bio here...'
              multiline
            />
            {!showFullBio && bio.length > MAX_BIO_LENGTH && (
              <TouchableOpacity onPress={() => setShowFullBio(true)}>
                <Text style={styles.viewAll}>View all</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {/* Edit and Save Buttons */}
        <View style={styles.buttonRow}>
          {isEditing && (
            <TouchableOpacity
              onPress={handleSaveChanges}
              style={styles.saveButton}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Timeline Section */}
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineTitle}>Your Event Timeline</Text>
        </View>
        {loadingEvents ? (
          <View style={{ alignItems: 'center', marginTop: 32 }}>
            <Text>Loading events...</Text>
          </View>
        ) : (
          <>
            {visibleEvents.map((item) => (
              <MemoProfileEventCard
                key={item.id}
                item={item}
                user={user}
                GOOGLE_MAPS_API_KEY={GOOGLE_MAPS_API_KEY}
                onShare={onShare}
                onEllipsisClick={handleEllipsisClick}
              />
            ))}
            {visibleCount < allEvents.length && (
              <TouchableOpacity
                style={styles.showMoreButton}
                onPress={() => setVisibleCount((c) => c + EVENTS_PAGE_SIZE)}
              >
                <Text style={styles.showMoreText}>Show More</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Modular event card (memoized) ---
const MemoProfileEventCard = memo(function ProfileEventCard({
  item,
  user,
  GOOGLE_MAPS_API_KEY,
  onShare,
  onEllipsisClick,
}) {
  // Description: Determine event role for user based on event arrays
  let role = '';
  const now = new Date();

  // --- Get event end date ---
  let eventDateObj = null;
  if (item.date) {
    if (item.date.toDate) eventDateObj = item.date.toDate();
    else if (item.date instanceof Date) eventDateObj = item.date;
    else if (typeof item.date === 'object' && item.date.seconds)
      eventDateObj = new Date(item.date.seconds * 1000);
  } else if (item.endAt) {
    if (item.endAt.toDate) eventDateObj = item.endAt.toDate();
    else if (item.endAt instanceof Date) eventDateObj = item.endAt;
    else if (typeof item.endAt === 'object' && item.endAt.seconds)
      eventDateObj = new Date(item.endAt.seconds * 1000);
  } else if (item.startAt) {
    if (item.startAt.toDate) eventDateObj = item.startAt.toDate();
    else if (item.startAt instanceof Date) eventDateObj = item.startAt;
    else if (typeof item.startAt === 'object' && item.startAt.seconds)
      eventDateObj = new Date(item.startAt.seconds * 1000);
  }

  const isUpcoming = eventDateObj ? eventDateObj >= now : false;

  // Get user's event arrays for role logic
  const createdEventsArr = Array.isArray(user.createdEvents)
    ? user.createdEvents
    : [];
  const attendingEventsArr = Array.isArray(user.attendingEvents)
    ? user.attendingEvents
    : [];
  const attendedEventsArr = Array.isArray(user.attendedEvents)
    ? user.attendedEvents
    : [];

  // --- FIXED LOGIC ---
  if (createdEventsArr.includes(item.id)) {
    role = isUpcoming ? 'Hosting' : 'Hosted';
  } else if (attendingEventsArr.includes(item.id)) {
    role = isUpcoming ? 'Attending' : 'Attended';
  } else if (attendedEventsArr.includes(item.id)) {
    role = 'Attended';
  }

  // Description: Use event image or exclude image section if none exists
  const imageUrl = item.imageURL || item.imageUri || item.imageUrl || null;

  // --- Date/time logic ---
  let eventDateTime = '';
  if (item.date) {
    if (item.date.toDate) {
      eventDateTime = item.date.toDate().toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (item.date instanceof Date) {
      eventDateTime = item.date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (typeof item.date === 'object' && item.date.seconds) {
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
    if (item.startAt.toDate) {
      eventDateTime = item.startAt.toDate().toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (item.startAt instanceof Date) {
      eventDateTime = item.startAt.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (typeof item.startAt === 'object' && item.startAt.seconds) {
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
  const [cityState, setCityState] = React.useState('');
  React.useEffect(() => {
    async function fetchCityState() {
      if (item.location) {
        if (item.location.city && item.location.state) {
          setCityState(`${item.location.city}, ${item.location.state}`);
        } else if (item.location.latitude && item.location.longitude) {
          try {
            const res = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${item.location.latitude},${item.location.longitude}&key=${GOOGLE_MAPS_API_KEY}`
            );
            const data = await res.json();
            if (data.status === 'OK' && data.results.length) {
              const addressComponents = data.results[0].address_components;
              const city = addressComponents.find((c) =>
                c.types.includes('locality')
              )?.short_name;
              const state = addressComponents.find((c) =>
                c.types.includes('administrative_area_level_1')
              )?.short_name;
              setCityState(
                city && state
                  ? `${city}, ${state}`
                  : data.results[0].formatted_address
              );
            } else {
              setCityState('Location not available');
            }
          } catch {
            setCityState('Location not available');
          }
        } else if (typeof item.location === 'string') {
          const parts = item.location.split(',');
          setCityState(
            parts.length >= 2
              ? `${parts[parts.length - 2].trim()}, ${parts[
                  parts.length - 1
                ].trim()}`
              : item.location.trim()
          );
        } else if (item.location.address) {
          const addrParts = item.location.address.split(',');
          setCityState(
            addrParts.length >= 2
              ? `${addrParts[addrParts.length - 2].trim()}, ${addrParts[
                  addrParts.length - 1
                ].trim()}`
              : item.location.address.trim()
          );
        } else {
          setCityState('Location not specified');
        }
      } else {
        setCityState('Location not specified');
      }
    }
    fetchCityState();
  }, [item.location]);

  // --- Attendee count ---
  const attendeeCount = Array.isArray(item.attendees)
    ? item.attendees.length
    : 0;

  // Description: Render event card
  return (
    <View style={styles.eventCard}>
      {imageUrl && (
        <Image source={{ uri: imageUrl }} style={styles.eventImage} />
      )}
      <TouchableOpacity
        style={styles.ellipsisButtonAbsolute}
        accessibilityLabel='More options'
        onPress={() => onEllipsisClick(item)}
      >
        <Text style={styles.ellipsisText}>•••</Text>
      </TouchableOpacity>
      <View style={styles.eventInfo}>
        <View style={styles.eventInfoHeader}>
          <Text style={styles.eventRole}>{role}</Text>
        </View>
        <Text style={styles.eventTitle}>{item.title}</Text>
        <View style={styles.eventMetaRow}>
          <Text style={styles.eventDate}>{eventDateTime}</Text>
        </View>
        {cityState ? (
          <View style={styles.eventMetaRow}>
            <Text style={styles.eventLocation}>{cityState}</Text>
          </View>
        ) : null}
        <View style={styles.eventAttendeesRow}>
          <Text style={styles.eventAttendees}>{attendeeCount} attending</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.shareButtonInline}
            onPress={() => onShare(item)}
            accessibilityLabel='Share event'
          >
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// --- Styles ---
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  modalOption: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  sidebar: {
    width: 240,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
    elevation: 5,
  },
  sidebarItem: { paddingVertical: 15 },
  sidebarText: { fontSize: 16, fontWeight: 'bold' },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 12,
  },
  navTitle: { fontSize: 20, fontWeight: 'bold' },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  avatarRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  profileImage: {
    width: 125,
    height: 125,
    borderRadius: 10,
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
  bioContainer: {
    backgroundColor: '#f0f0f0',
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    width: '100%',
  },
  bioInput: {
    width: '100%',
    padding: 10,
    textAlignVertical: 'top',
  },
  bioInputEditing: {
    borderWidth: 1,
    borderColor: 'gray',
    borderRadius: 5,
    backgroundColor: '#f9f9f9',
  },
  bioText: {
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
  },
  disabledInput: {
    backgroundColor: '#e0e0e0',
  },
  viewAll: { color: '#0066cc', marginTop: 4 },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
  },
  editButton: {
    backgroundColor: '#0066cc',
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  editButtonText: { color: '#fff', fontWeight: 'bold' },
  saveButton: {
    backgroundColor: '#28a745',
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
  timelineHeader: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  timelineTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
  },
  eventMeta: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  showMoreButton: {
    alignSelf: 'center',
    marginVertical: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: '#eee',
    borderRadius: 6,
  },
  showMoreText: {
    color: '#0066cc',
    fontWeight: 'bold',
    fontSize: 15,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  list: { paddingBottom: 16 },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    position: 'relative',
  },
  eventImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#ddd',
    marginRight: 12,
    marginTop: 2,
  },
  eventInfo: {
    flex: 1,
    flexDirection: 'column',
    position: 'relative',
  },
  eventInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  eventRole: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#222',
    textTransform: 'capitalize',
  },
  ellipsisButtonAbsolute: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ellipsisText: {
    fontSize: 20,
    color: '#888',
    fontWeight: 'bold',
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 2,
    gap: 8,
  },
  eventLocation: {
    fontSize: 13,
    color: '#007AFF',
    marginLeft: 8,
    fontWeight: '500',
  },
  eventDate: {
    fontSize: 13,
    color: '#888',
    marginBottom: 2,
    marginTop: 2,
    fontWeight: '500',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
    color: '#222',
  },
  eventAttendees: {
    fontSize: 13,
    color: '#444',
    marginTop: 2,
    fontWeight: '500',
  },
  eventAttendeesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  shareButtonInline: {
    backgroundColor: '#0066cc',
    borderRadius: 5,
    paddingVertical: 7,
    paddingHorizontal: 16,
    alignSelf: 'flex-end',
    marginLeft: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#000',
    marginTop: 10,
    marginBottom: 24,
  },
});
