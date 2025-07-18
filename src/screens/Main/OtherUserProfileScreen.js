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
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getUserData } from '../../firebase/config';

export default function OtherUserProfileScreen({ route, navigation }) {
  // Assume route.params.userId is passed in
  const { userId } = route.params;
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const tabs = ['Current', 'Past'];
  const [activeTab, setActiveTab] = useState('Current');

  useEffect(() => {
    // Fetch other user's data
    const fetchUser = async () => {
      const data = await getUserData(userId);
      setUser(data);
      setEvents(data.events || []);
    };
    fetchUser();
  }, [userId]);

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
  const friendsCount = Array.isArray(user.friends)
    ? user.friends.length
    : user.friendCount || 0;
  const eventsCount = Array.isArray(user.events)
    ? user.events.length
    : user.eventCount || 0;
  const bio = user.bio || '';
  const MAX_BIO_LENGTH = 100;

  // Popup actions
  const handleReport = () => {
    setMenuVisible(false);
    Alert.alert('Report User', 'Reporting functionality coming soon.');
  };

  const handleAddFriend = () => {
    // TODO: Implement friend request logic
    Alert.alert('Friend Request', 'Friend request sent!');
  };

  return (
    <SafeAreaView style={styles.safe}>
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

        {/* Card Row for Friends, Events, Badges */}
        <View style={styles.cardRow}>
          <View style={styles.cardItem}>
            <Text style={styles.cardValue}>{friendsCount}</Text>
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

        <TouchableOpacity
          style={styles.addFriendButton}
          onPress={handleAddFriend}
        >
          <Text style={styles.addFriendText}>Add Friend</Text>
        </TouchableOpacity>
        <View style={styles.bioContainer}>
          <Text style={styles.bioText}>
            {bio.length > MAX_BIO_LENGTH
              ? bio.slice(0, MAX_BIO_LENGTH) + '...'
              : bio}
          </Text>
        </View>
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
});
