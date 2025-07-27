// src/screens/Main/DiscoveryScreen.js

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import * as Location from 'expo-location'; // Import for location services
import {
  fetchHotEvents,
  fetchNewEvents,
  fetchTodayEvents,
  fetchThisWeekEvents,
} from '../../services/discoveryQueries';
import PostCard from '../../components/PostCard';
import { fetchUserInterests } from '../../services/userQueries'; // Import for fetching user interests

export default function DiscoveryScreen() {
  const [activeTab, setActiveTab] = useState('Hot');
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [events, setEvents] = useState([]);
  const [userCity, setUserCity] = useState('');
  const [userInterests, setUserInterests] = useState([]);

  useEffect(() => {
    async function initializeUserData() {
      try {
        // Fetch user location
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.error('Location permission not granted');
          return;
        }
        const location = await Location.getCurrentPositionAsync({});
        const geocode = await Location.reverseGeocodeAsync(location.coords);
        if (geocode.length > 0) {
          setUserCity(geocode[0].city || ''); // Set user's city
        }

        // Fetch user interests
        const interests = await fetchUserInterests(); // Replace with actual user interests fetching logic
        setUserInterests(interests || []);
      } catch (error) {
        console.error('Error initializing user data:', error);
      }
    }

    initializeUserData();
  }, []);

  useEffect(() => {
    async function loadEvents() {
      let data = [];

      // ✅ Hot tab = show all interests
      if (activeTab === 'Hot') {
        data = await fetchHotEvents(userInterests, userCity);
      }
      // ✅ Other tabs = filter by selectedInterest if set, otherwise all
      else {
        const interestsToUse = selectedInterest
          ? [selectedInterest]
          : userInterests;

        if (activeTab === 'New') {
          data = await fetchNewEvents(interestsToUse, userCity);
        } else if (activeTab === 'Today') {
          data = await fetchTodayEvents(interestsToUse, userCity);
        } else if (activeTab === 'This Week') {
          data = await fetchThisWeekEvents(interestsToUse, userCity);
        }
      }

      setEvents(data);
    }

    if (userCity && userInterests.length > 0) {
      loadEvents();
    }
  }, [activeTab, selectedInterest, userCity, userInterests]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discovery</Text>
      </View>

      {/* TOP TABS */}
      <View style={styles.tabRow}>
        {['Hot', 'New', 'Today', 'This Week'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => {
              setActiveTab(tab);
              if (tab === 'Hot') setSelectedInterest(null); // Reset interest filter for Hot
            }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* INTEREST CHIPS (Hidden on Hot) */}
      {activeTab !== 'Hot' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
        >
          {userInterests.map((interest) => (
            <TouchableOpacity
              key={interest}
              style={[
                styles.chip,
                selectedInterest === interest && styles.activeChip,
              ]}
              onPress={() =>
                setSelectedInterest(
                  selectedInterest === interest ? null : interest
                )
              }
            >
              <Text
                style={[
                  styles.chipText,
                  selectedInterest === interest && styles.activeChipText,
                ]}
              >
                {interest}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* EVENTS LIST */}
      <ScrollView style={styles.container}>
        {events.map((event) => (
          <PostCard key={event.id} event={event} />
        ))}
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
  header: {
    paddingTop: 10,
    paddingBottom: 15,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
  },
  container: {
    flex: 1,
    paddingHorizontal: 10,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tab: {
    backgroundColor: '#eee',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginRight: 8,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    color: '#333',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },

  chipRow: {
    backgroundColor: '#fff',
    paddingVertical: 6, // ✅ Reduced from 8
    paddingLeft: 10,
    marginBottom: 6,
    maxHeight: 46, // ✅ Keeps row compact (chip height ~34 + padding)
  },
  chip: {
    backgroundColor: '#f1f1f1',
    paddingVertical: 4, // ✅ Reduced padding
    paddingHorizontal: 12,
    borderRadius: 15,
    marginRight: 8,
    alignSelf: 'center', // ✅ Prevents stretching vertically
  },
  activeChip: {
    backgroundColor: '#007AFF',
  },
  chipText: {
    color: '#333',
    fontWeight: '500',
    fontSize: 14, // ✅ Smaller font for neat fit
  },
  activeChipText: {
    color: '#fff',
  },
});
