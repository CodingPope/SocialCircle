// src/screens/Main/DiscoveryScreen.js
import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  RefreshControl,
} from 'react-native';
import * as Location from 'expo-location';
import {
  fetchHotEvents,
  fetchNewEvents,
  fetchThisWeekEvents,
} from '../../services/discoveryQueries';
import PostCard from '../../components/PostCard';
import { fetchUserInterests, fetchUserById } from '../../services/userQueries';
import EventPopupCard from '../../components/EventPopUpCard';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DiscoveryScreen() {
  const [popupEvent, setPopupEvent] = useState(null);
  const [activeTab, setActiveTab] = useState('Hot');
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [events, setEvents] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [userCity, setUserCity] = useState('');
  const [userInterests, setUserInterests] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const chipScrollViewRef = useRef(null);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    async function initializeUserData() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const location = await Location.getCurrentPositionAsync({});
        setUserLocation(location.coords);

        const geocode = await Location.reverseGeocodeAsync(location.coords);
        const city = geocode[0]?.city || '';
        setUserCity(city);

        const interests = await fetchUserInterests();
        const storedPinnedInterests = await AsyncStorage.getItem(
          'pinnedInterests'
        );
        const pinnedInterests = storedPinnedInterests
          ? JSON.parse(storedPinnedInterests)
          : [];
        const sortedInterests = [
          ...pinnedInterests,
          ...interests.filter((i) => !pinnedInterests.includes(i)),
        ];
        setUserInterests(sortedInterests || []);
      } catch (error) {
        console.error('Error initializing user data:', error);
      }
    }

    initializeUserData();
  }, []);

  useEffect(() => {
    if (
      (activeTab === 'New' || activeTab === 'This Week') &&
      userInterests.length > 0
    ) {
      setSelectedInterest(userInterests[0]);
    }
  }, [activeTab, userInterests]);

  useEffect(() => {
    if (!userLocation) return;

    const shouldLoad =
      activeTab === 'Hot' ||
      ((activeTab === 'New' || activeTab === 'This Week') && selectedInterest);

    if (shouldLoad) {
      setLastDoc(null);
      loadEvents(true);
    }
  }, [activeTab, selectedInterest, userLocation]);

  async function enrichEvents(data) {
    return await Promise.all(
      data.map(async (event) => {
        try {
          const userData = await fetchUserById(event.ownerId);
          return {
            ...event,
            userData: {
              name: `${userData.firstName} ${userData.lastName}`.trim(),
              photoURL: userData.profileImage,
              rating: userData.rating,
            },
            formattedDate: event.date?.seconds
              ? new Date(event.date.seconds * 1000).toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Date TBD',
          };
        } catch {
          return {
            ...event,
            userData: { name: 'Unknown Host', photoURL: null, rating: 0 },
            formattedDate: 'Date TBD',
          };
        }
      })
    );
  }

  async function loadEvents(reset = false) {
    console.log('User location:', userLocation);
    console.log('Selected interest:', selectedInterest);
    if (!userLocation || (activeTab !== 'Hot' && !selectedInterest)) return;

    let newEvents = [];

    if (activeTab === 'Hot') {
      newEvents = await fetchHotEvents(userInterests, userLocation);
    } else if (activeTab === 'New') {
      const result = await fetchNewEvents(
        selectedInterest,
        userLocation,
        reset ? null : lastDoc
      );
      newEvents = result.events;
      setLastDoc(result.lastDoc);
    } else if (activeTab === 'This Week') {
      if (!selectedInterest) return; // fallback safety
      const result = await fetchThisWeekEvents(
        selectedInterest,
        userLocation,
        reset ? null : lastDoc
      );
      newEvents = result.events;
      setLastDoc(result.lastDoc);
    }

    const enriched = await enrichEvents(newEvents);

    setEvents((prevEvents) => {
      const merged = reset ? enriched : [...prevEvents, ...enriched];

      // De-duplicate by ID
      const uniqueById = merged.filter(
        (event, index, self) =>
          index === self.findIndex((e) => e.id === event.id)
      );

      return uniqueById;
    });
  }

  const handleScroll = ({ nativeEvent }) => {
    const bottomReached =
      nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >=
      nativeEvent.contentSize.height - 50;

    if (bottomReached && !isLoadingMore && activeTab === 'New') {
      setIsLoadingMore(true);
      loadEvents(false).finally(() => setIsLoadingMore(false));
    }
  };

  function pinInterest(interest) {
    setUserInterests((prev) => {
      const updated = [interest, ...prev.filter((i) => i !== interest)];
      AsyncStorage.setItem('pinnedInterests', JSON.stringify(updated));
      return updated;
    });
    setSelectedInterest(interest);
  }

  function selectInterest(interest) {
    setUserInterests((prev) => {
      const updated = [interest, ...prev.filter((i) => i !== interest)];
      AsyncStorage.setItem('pinnedInterests', JSON.stringify(updated));
      return updated;
    });
    setSelectedInterest(interest);
    chipScrollViewRef.current?.scrollTo({ x: 0, animated: true });
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents(true);
    setRefreshing(false);
  };

  const tabs = ['Hot', 'New', 'This Week', 'Explore'];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discovery</Text>
      </View>

      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => {
              setActiveTab(tab);
              if (tab === 'Hot') setSelectedInterest(null);
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

      {activeTab !== 'Hot' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          ref={chipScrollViewRef}
        >
          {userInterests.map((interest) => (
            <TouchableOpacity
              key={interest}
              style={[
                styles.chip,
                selectedInterest === interest && styles.activeChip,
              ]}
              onPress={() => selectInterest(interest)}
              onLongPress={() => pinInterest(interest)}
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

      <ScrollView
        style={[styles.container, { minHeight: 400 }]}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        ref={scrollViewRef}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'Explore' ? (
          <Text style={styles.comingSoonMessage}>
            This feature is coming soon!
          </Text>
        ) : events.length === 0 ? (
          <Text style={styles.emptyMessage}>No events found</Text>
        ) : (
          events.map((event) => (
            <PostCard
              key={
                event.id ||
                `${event.ownerId}-${event.createdAt?.seconds || Math.random()}`
              }
              event={{
                ...event,
                location: {
                  address: event.address,
                  latitude: event.location?.latitude,
                  longitude: event.location?.longitude,
                },
                hostName: event.userData?.name,
                hostPhoto: event.userData?.photoURL,
                hostRating: event.userData?.rating,
                formattedDate: event.formattedDate,
                interest: event.interest,
                attendees: event.attendees,
              }}
              onPress={() => setPopupEvent(event)}
              onJoinPress={() => setPopupEvent(event)}
            />
          ))
        )}
      </ScrollView>

      {popupEvent && (
        <EventPopupCard
          event={popupEvent}
          onClose={() => setPopupEvent(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
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
    paddingVertical: 6,
    paddingLeft: 10,
    marginBottom: 6,
    maxHeight: 46,
  },
  chip: {
    backgroundColor: '#f1f1f1',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginRight: 8,
    alignSelf: 'center',
  },
  activeChip: {
    backgroundColor: '#007AFF',
  },
  chipText: {
    color: '#333',
    fontWeight: '500',
    fontSize: 14,
  },
  activeChipText: {
    color: '#fff',
  },
  emptyMessage: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  comingSoonMessage: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
});
