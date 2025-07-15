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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AuthContext } from '../../context/AuthContext';
import { signOut } from 'firebase/auth';
import {
  auth,
  getUserData,
  updateUserData,
  uploadProfileImage,
} from '../../firebase/config';
import { useMyEvents } from '../../hooks/useMyEvents';
import * as ImagePicker from 'expo-image-picker';

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
  const rating = user.rating || 0;
  const [ratingCount, setRatingCount] = useState(0);
  const [verified, setVerified] = useState(false);
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
      setRating(data.rating || 0);
      setRatingCount(data.ratingCount || 0);
      setVerified(data.verified || false);
      console.log('Verified state:', data.verified); // Debugging line
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
    try {
      // Request permission to access the photo library
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        alert('Permission to access the photo library is required!');
        return;
      }

      // Open the image picker
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

      // Upload the selected image
      const imageUri = pickerResult.assets[0].uri;
      const response = await fetch(imageUri);
      const blob = await response.blob();

      const newImage = await uploadProfileImage(user.uid, blob);

      if (newImage) {
        // Save the new image URL to Firestore
        await updateUserData(user.uid, { profileImage: newImage });
        setProfileImage(newImage);
        alert('Profile image updated successfully!');
      } else {
        alert('Failed to upload image.');
      }
    } catch (error) {
      console.error('Image upload failed:', error);
      alert('Failed to update profile image. Please try again.');
    }
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
        <View style={styles.headerTop}>
          <View style={styles.imageContainer}>
            <TouchableOpacity onPress={isEditing ? handleImageUpload : null}>
              <Image
                source={{ uri: profileImage || avatarURL }}
                style={styles.profileImage}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.infoContainer}>
            <Text style={styles.name}>
              {fullName}
              {verified && (
                <MaterialIcons name='verified' size={24} color='black' />
              )}
            </Text>
            <Text style={styles.stat}>
              {ratingCount === 0
                ? '☆☆☆☆☆ (unrated)'
                : `${
                    '★'.repeat(Math.floor(rating)) +
                    '☆'.repeat(5 - Math.floor(rating))
                  } (${ratingCount})`}
            </Text>
            <Text style={styles.since}>User since {userSince}</Text>
          </View>
          <View style={[styles.statContainer, styles.statSpacing]}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {friendCount.toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>Friends</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{eventCount}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
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
    padding: 16,
    borderRadius: 8,
  },
  headerTop: {
    flexDirection: 'row', // Align items horizontally
    alignItems: 'center',
  },
  imageContainer: {
    marginRight: 16, // Space between image and text
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 15,
  },
  headerCenter: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
  },
  badge: { width: 20, height: 20, marginLeft: 4 },
  stars: { marginTop: 4 },
  since: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  stat: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    marginTop: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'right', // Align the value to the right
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
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
  headerBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  statContainer: {
    alignItems: 'flex-end',
    marginLeft: 'auto',
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
  verifiedIcon: {
    marginLeft: 8,
  },
});
