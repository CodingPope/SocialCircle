import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import EventCard from '../../components/EventCard';

const Tab = createMaterialTopTabNavigator();

// Mock user data
const user = {
  name: 'Joe Pope',
  verified: true,
  verifiedBadge:
    'https://assets.streamlinehq.com/image/private/w_300,h_300,ar_1/f_auto/v1/icons/money/verified-check-ca7rmvb03mgm9cka4j1lc.png/verified-check-tuxwv4rjfpcddhyth8hamp.png?_a=DAJFJtWIZAAC',
  friendsCount: 135,
  eventsAttended: 200, // Example: how many total events this user has attended
  userSince: 'Aug 2024',
  bio: 'Simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry’s standard dummy...',
  avatar:
    'https://wallpapers.com/images/hd/cool-profile-pictures-panda-man-gsl2ntkjj3hrk84s.jpg',
  rating: 5, // out of 5
};

// Mock events data (defined globally)
const mockEvents = [
  {
    id: '1',
    title: 'Title of event 1',
    details: 'Details about event 1',
  },
  {
    id: '2',
    title: 'Title of event 2',
    details: 'Details about event 2',
  },
  {
    id: '3',
    title: 'Title of event 3',
    details: 'Details about event 3',
  },
];

// Screens for each tab
function CurrentMeetsScreen() {
  return (
    <FlatList
      data={mockEvents}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EventCard title={item.title} details={item.details} />
      )}
      contentContainerStyle={{ padding: 16 }}
    />
  );
}

function PastScreen() {
  return (
    <FlatList
      data={mockEvents}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EventCard title={item.title} details={item.details} />
      )}
      contentContainerStyle={{ padding: 16 }}
    />
  );
}

function ArchiveScreen() {
  return (
    <FlatList
      data={mockEvents}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EventCard title={item.title} details={item.details} />
      )}
      contentContainerStyle={{ padding: 16 }}
    />
  );
}

export default function ProfileScreen() {
  const stars = '★'.repeat(user.rating);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.hamburgerButton}>
          <Icon name='menu' size={30} color='#000' />
        </TouchableOpacity>
      </View>

      {/* Profile Info */}
      <View style={styles.profileInfo}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
            <View style={styles.userInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.userName}>{user.name}</Text>
                {user.verified && (
                  <Image
                    source={{ uri: user.verifiedBadge }}
                    style={styles.verifiedBadge}
                  />
                )}
              </View>
              <Text style={styles.stars}>{stars}</Text>
              <Text style={styles.userSince}>User since {user.userSince}</Text>
            </View>
          </View>

          {/* Example metrics: Events Attended and Friends */}
          <View style={styles.profileMetrics}>
            <Text style={styles.metricText}>
              Events{'\n'}
              {user.eventsAttended}
            </Text>
            <Text style={styles.metricText}>
              Friends{'\n'}
              {user.friendsCount.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {/* Bio */}
      <View style={styles.bioSection}>
        <Text style={styles.bioText}>
          {user.bio}
          <Text style={styles.viewAllLink}> View all</Text>
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <Tab.Navigator
          screenOptions={{
            tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
            tabBarIndicatorStyle: { backgroundColor: 'black' },
            tabBarStyle: { backgroundColor: '#f0f0f0' },
          }}
        >
          <Tab.Screen name='Current meets' component={CurrentMeetsScreen} />
          <Tab.Screen name='Past' component={PastScreen} />
          <Tab.Screen name='Archive' component={ArchiveScreen} />
        </Tab.Navigator>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Container for the entire screen */
  container: {
    flex: 1,
    backgroundColor: 'white',
  },

  /** Header bar with title and menu icon */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    elevation: 2, // Shadow effect on Android
    marginTop: 25, // Optional: push it down a bit on iOS
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  hamburgerButton: {
    padding: 10,
  },

  /** Profile info block (avatar, name, metrics) */
  profileInfo: {
    backgroundColor: 'white',
    elevation: 2, // Shadow effect
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 15,
    marginRight: 10,
  },
  userInfo: {
    flexShrink: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    marginRight: 5,
  },
  verifiedBadge: {
    width: 20,
    height: 20,
  },
  stars: {
    fontSize: 16,
    color: '#000',
    marginVertical: 4,
  },
  userSince: {
    fontSize: 12,
    color: '#555',
  },

  /** Metrics (Events Attended, Friends) */
  profileMetrics: {
    flexDirection: 'row',
  },
  metricText: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 20,
  },

  /** Bio card */
  bioSection: {
    backgroundColor: '#ccc',
    margin: 10,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  bioText: {
    fontSize: 14,
    color: '#333',
  },
  viewAllLink: {
    color: 'blue',
    textDecorationLine: 'underline',
  },

  /** Tab area */
  tabsContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
