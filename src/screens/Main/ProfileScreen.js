// src/screens/Main/ProfileScreen.js
import React, { useState, useContext, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Share,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthContext } from '../../context/AuthContext';
import { signOut } from 'firebase/auth';
import {
  auth,
  getUserData,
  updateUserData,
  uploadProfileImage,
} from '../../firebase/config';
import { useMyEvents } from '../../hooks/useMyEvents';

export default function ProfileScreen({ navigation }) {
  const { user } = useAuth();
  const myEvents = useMyEvents(user?.uid || '');
  const now = new Date();

  // Partition events
  const currentMeets = myEvents.filter((ev) => ev.startAt.toDate() >= now);
  const pastMeets = myEvents.filter((ev) => ev.startAt.toDate() < now);
  const archiveMeets = [];

  const tabs = ['Current', 'Past', 'Archive'];
  const [activeTab, setActiveTab] = useState('Current');

  const [showFullBio, setShowFullBio] = useState(false);
  const MAX_BIO_LENGTH = 100;

  const [bio, setBio] = useState('');
  const [friendCount, setFriendCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [profileImage, setProfileImage] = useState(null);
  const [isEditing, setIsEditing] = useState(false); // Track edit mode

  const fullName = `${user.firstName} ${user.lastName}`;
  const avatarURL = user.avatarURL || 'https://example.com/default-avatar.png';
  const rating = user.rating || 4.5;
  const userSince =
    user.createdAt && typeof user.createdAt.toDate === 'function'
      ? user.createdAt
          .toDate()
          .toLocaleString('default', { month: 'short', year: 'numeric' })
      : '';

  const eventsCount = myEvents.length;
  const friendsCount = Array.isArray(user.friends) ? user.friends.length : 0;

  // sidebar menu visibility
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    // Fetch user data on mount
    const fetchUserData = async () => {
      const data = await getUserData(user.uid);
      setBio(data.bio || '');
      setFriendCount(data.friendCount || 0);
      setEventCount(data.eventCount || 0);
      setProfileImage(data.profileImage || null);
    };

    fetchUserData();
  }, [user.uid]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.replace('Auth');
    } catch (err) {
      console.error(err);
      Alert.alert('Logout failed', err.message);
    }
  };

  const data =
    activeTab === 'Current'
      ? currentMeets
      : activeTab === 'Past'
      ? pastMeets
      : archiveMeets;

  const truncatedBio =
    bio.length > MAX_BIO_LENGTH ? bio.slice(0, MAX_BIO_LENGTH) + '...' : bio;

  const onShare = async (item) => {
    try {
      await Share.share({
        message: `Join my event: ${item.title}\n\n${item.description}`,
      });
    } catch (err) {
      console.warn('Share error', err);
    }
  };

  const handleBioUpdate = async () => {
    await updateUserData(user.uid, { bio });
    alert('Bio updated successfully!');
  };

  const handleImageUpload = async () => {
    const newImage = await uploadProfileImage(user.uid);
    setProfileImage(newImage);
    alert('Profile image updated successfully!');
  };

  const handleSaveChanges = async () => {
    await updateUserData(user.uid, { bio });
    setIsEditing(false);
    alert('Changes saved successfully!');
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Sidebar Modal from right */}
      <Modal
        visible={menuVisible}
        animationType='slide'
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPressOut={() => setMenuVisible(false)}
        >
          <View style={styles.sidebar}>
            <TouchableOpacity style={styles.sidebarItem} onPress={handleLogout}>
              <Text style={styles.sidebarText}>Log Out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => setIsEditing(true)}
            >
              <Text style={styles.sidebarText}>Edit Profile</Text>
            </TouchableOpacity>
            {/* more items here */}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Top nav */}
      <View style={styles.navBar}>
        <Text style={styles.navTitle}>Profile</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Ionicons name='menu' size={28} />
        </TouchableOpacity>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={isEditing ? handleImageUpload : null}
          style={styles.imageContainer}
        >
          <Image
            source={profileImage ? { uri: profileImage } : { uri: avatarURL }}
            style={styles.profileImage}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{fullName}</Text>
            {user.isVerified && (
              <Image
                source={{ uri: user.verifiedBadgeURL }}
                style={styles.badge}
              />
            )}
          </View>
          <Text style={styles.stars}>
            {'★'.repeat(rating) + '☆'.repeat(5 - rating)}
          </Text>
          <Text style={styles.since}>User since {userSince}</Text>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{eventsCount}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{friendsCount}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
        </View>
      </View>

      {/* Bio */}
      <View style={styles.bioContainer}>
        <TextInput
          style={[styles.bioInput, isEditing && styles.bioInputEditing]}
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

      {/* Tabs */}
      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.tabButton,
              activeTab === tab && styles.tabButtonActive,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Events List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.eventCard}>
            <View style={styles.eventImagePlaceholder} />
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle}>{item.title}</Text>
              <Text style={styles.eventDetails}>{item.description}</Text>
            </View>
            <TouchableOpacity onPress={() => onShare(item)}>
              <Text style={styles.share}>Share</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  modalOverlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
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
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
  },
  imageContainer: {
    marginBottom: 20,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  headerCenter: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 22, fontWeight: 'bold' },
  badge: { width: 20, height: 20, marginLeft: 4 },
  stars: { marginTop: 4 },
  since: { marginTop: 4, color: '#666' },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { alignItems: 'center', marginLeft: 16 },
  statValue: { fontSize: 18, fontWeight: 'bold' },
  statLabel: { color: '#666' },
  bioContainer: {
    backgroundColor: '#f0f0f0',
    margin: 16,
    padding: 12,
    borderRadius: 8,
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
  share: { color: '#0066cc' },
});
