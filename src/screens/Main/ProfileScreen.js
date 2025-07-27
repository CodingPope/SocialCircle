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
  Platform,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useAuth } from '../../context/AuthContext';
import { useMyEvents } from '../../hooks/useMyEvents';
import * as ImagePicker from 'expo-image-picker';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from 'firebase/firestore';
import PostCard from '../../components/PostCard';
import PopupMenu from '../../components/PopupMenu'; // Import the PopupMenu component
import { GOOGLE_MAPS_API_KEY } from '@env';

// Helper: Merge unique events and sort by startAt descending
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
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [enhancedEvents, setEnhancedEvents] = useState([]);

  // --- Derived ---
  const fullName = `${user.firstName} ${user.lastName}`;
  const avatarURL =
    user.profileImage ||
    user.avatarURL ||
    'https://example.com/default-avatar.png';
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
  const eventCount =
    (Array.isArray(user.createdEvents) ? user.createdEvents.length : 0) +
    (Array.isArray(user.attendedEvents) ? user.attendedEvents.length : 0);

  // --- Refresh handler ---
  const onRefresh = useCallback(async () => {
    if (!user?.uid) return;
    setRefreshing(true);
    const data = await getUserData(user.uid);
    setBio(data.bio || '');
    setProfileImage(data.profileImage || null);
    setRating(data.rating || 0);
    setRatingCount(data.ratingCount || 0);
    setVerified(data.verified || false);
    setRefreshing(false);
  }, [user?.uid]);

  useEffect(() => {
    let isMounted = true;
    const fetchUserData = async () => {
      if (!user?.uid) return;
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
  }, [user?.uid]);

  useEffect(() => {
    let isMounted = true;
    async function fetchUserEvents() {
      setLoadingEvents(true);
      if (!user?.uid) {
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
  }, [user?.uid, myEvents]);

  // ✅ Move these two lines UP, before the useEffect
  const allEvents = mergeUniqueEvents(
    userEvents.created,
    userEvents.attending,
    userEvents.attended,
    groupEvents
  );
  const visibleEvents = allEvents.slice(0, visibleCount);

  useEffect(() => {
    const fetchHostPhotosAndNames = async () => {
      const updated = await Promise.all(
        visibleEvents.map(async (event) => {
          if (!event.ownerId) {
            return {
              ...event,
              hostPhoto: null,
              hostRating: 0,
              hostName: 'Unknown Host',
            };
          }

          try {
            const snap = await getDoc(doc(db, 'users', event.ownerId));
            if (snap.exists()) {
              const data = snap.data();
              return {
                ...event,
                hostPhoto: data.profileImage || data.avatarURL || null,
                hostRating: data.rating || 0,
                hostName:
                  data.displayName ||
                  data.username ||
                  data.name ||
                  data.fullName ||
                  `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
                  event.ownerName || // fallback if stored directly on event
                  'Unknown Host',
              };
            }
          } catch (err) {
            console.error('Error fetching host info:', err);
          }

          return {
            ...event,
            hostPhoto: null,
            hostRating: 0,
            hostName: 'Unknown Host',
          };
        })
      );

      setEnhancedEvents(updated);
    };

    if (visibleEvents.length) {
      fetchHostPhotosAndNames();
    }
  }, [visibleEvents]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.reset({
        index: 0,
        routes: [{ name: 'AuthStack' }],
      });
    } catch (err) {
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

  const handleEllipsisClick = (event) => {
    setSelectedEvent(event);
    setModalVisible(true);
  };

  const handleDeleteEvent = () => {
    Alert.alert('Delete Event functionality coming soon.');
    setModalVisible(false);
  };

  const handleReportEvent = () => {
    Alert.alert('Report Event functionality coming soon.');
    setModalVisible(false);
  };

  const handleMenuOptionClick = (option) => {
    setSidebarVisible(false);
    switch (option) {
      case 'Edit Profile':
        setIsEditing(true);
        break;
      case 'Manage Interests':
        navigation.navigate('Interests'); // Navigate to InterestsScreen
        break;
      case 'Logout':
        handleLogout();
        break;
      default:
        break;
    }
  };

  const handleEventClick = async (eventId) => {
    try {
      const eventRef = doc(db, 'events', eventId);
      const eventSnapshot = await getDoc(eventRef);
      if (eventSnapshot.exists()) {
        navigation.navigate('EventChat', { eventId });
      } else {
        Alert.alert('Event not found', 'This event no longer exists.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to navigate to the event chat.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Sidebar Menu */}
      <Modal
        visible={sidebarVisible}
        animationType='slide'
        transparent
        onRequestClose={() => setSidebarVisible(false)}
      >
        <TouchableOpacity
          style={styles.sidebarOverlay}
          activeOpacity={1}
          onPressOut={() => setSidebarVisible(false)}
        >
          <View style={styles.sidebarContent}>
            {['Edit Profile', 'Manage Interests', 'Logout'].map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.sidebarOption}
                onPress={() => handleMenuOptionClick(option)}
              >
                <Text style={styles.sidebarOptionText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Settings / Ellipsis Modal */}
      <PopupMenu
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        isOwner={selectedEvent?.ownerId === user?.uid}
        onReport={handleReportEvent}
        onDelete={handleDeleteEvent}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <LinearGradient
          colors={['#4DA0B0', 'coral']}
          style={styles.profileHeader}
        >
          <View style={styles.navBar}>
            <Text style={styles.navTitle}>Profile</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => navigation.navigate('Notifications')}
                style={{ marginRight: 16 }}
              >
                <MaterialCommunityIcons
                  name='bell-outline'
                  size={28}
                  color='#fff'
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSidebarVisible(true)}>
                <Ionicons name='menu' size={28} color='#fff' />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.avatarWrapper}>
            <TouchableOpacity onPress={isEditing ? handleImageUpload : null}>
              <Image
                source={{ uri: profileImage || avatarURL }}
                style={styles.profileImage}
              />
            </TouchableOpacity>
            {verified && (
              <MaterialIcons
                name='verified'
                size={25}
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
          <TouchableOpacity style={styles.statCard}>
            <Text style={styles.statValue}>{followerCount}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard}>
            <Text style={styles.statValue}>{eventCount}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </TouchableOpacity>
          <View style={styles.statCard}>
            <MaterialIcons name='star' size={28} color='#FFD700' />
            <Text style={styles.statLabel}>Badges</Text>
          </View>
        </View>

        {/* Bio */}
        <View style={styles.bioContainer}>
          <TextInput
            style={[styles.bioText, isEditing && styles.bioEditing]}
            value={bio}
            onChangeText={setBio}
            editable={isEditing}
            placeholder='Write your bio here...'
            multiline
          />
          {bio.length > MAX_BIO_LENGTH && !showFullBio && (
            <TouchableOpacity onPress={() => setShowFullBio(true)}>
              <Text style={styles.showMoreText}>Show More</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Edit & Save Buttons */}
        {isEditing && (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveChanges}
            >
              <MaterialIcons name='check' size={18} color='#fff' />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Events Timeline */}
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineTitle}>Your Event Timeline</Text>
        </View>
        {loadingEvents ? (
          <Text style={{ textAlign: 'center', marginTop: 20 }}>
            Loading events...
          </Text>
        ) : (
          enhancedEvents.map((event) => {
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

            return (
              <PostCard
                key={event.id}
                event={{ ...event, role }}
                onPress={(e) => handleEventClick(e.id)}
                onEllipsisPress={(e) => handleEllipsisClick(e)}
              />
            );
          })
        )}
      </ScrollView>
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
    paddingBottom: 60,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
  },
  navTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
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
    marginTop: -50,
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
  bioContainer: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    elevation: 1,
  },
  bioText: { fontSize: 15, color: '#333' },
  bioEditing: { borderColor: '#ddd', borderWidth: 1, borderRadius: 8 },
  showMoreText: { color: '#007AFF', fontSize: 14, marginTop: 4 },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  editButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    gap: 6,
  },
  editButtonText: { color: '#fff', fontWeight: 'bold' },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    gap: 6,
  },
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
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
  ellipsisButtonAbsolute: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    padding: 5,
  },
  ellipsisText: {
    fontSize: 20,
    color: '#888',
    fontWeight: 'bold',
  },
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
  sidebarOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sidebarContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  sidebarOption: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sidebarOptionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
});
