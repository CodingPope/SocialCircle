// src/screens/Main/DiscoveryScreen.js
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
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
  fetchTodayEvents,
  fetchGenericEvents,
} from './discoveryQueries';
import PostCard from './PostCard';
import { fetchUserInterests } from '../profile/userQueries';
import EventPopupCard from './EventPopUpCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserSnippetStore } from '../profile/userSnippetStore';
import { useUserStore } from '../profile/userStore';
import {
  screen as trackScreen,
  event as trackEvent,
} from '../../services/analytics';
import { trackCardClick } from '../../lib/analytics';

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
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);
  const user = useUserStore((s) => s.user);
  const personalizationEnabled = !!user?.analyticsOptIn;

  const ALL_LABEL = 'All';

  // Track screen and tab selection (no-op if analytics disabled)
  useEffect(() => {
    trackScreen('Discovery');
  }, []);
  useEffect(() => {
    trackEvent('discovery_tab_select', { tab: activeTab });
  }, [activeTab]);

  useEffect(() => {
    async function initializeUserData() {
      try {
        // If personalization is disabled, don't request location or interests here
        if (!personalizationEnabled) {
          setUserLocation(null);
          setUserCity('');
          setUserInterests([]);
          // Load a generic set of upcoming events
          const generic = await fetchGenericEvents(20);
          setEvents(generic.filter((e) => e.isDeleted !== true));
          return;
        }

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
  }, [personalizationEnabled]);

  useEffect(() => {
    async function preloadData() {
      try {
        if (!personalizationEnabled) {
          const cachedEvents = await AsyncStorage.getItem('genericEvents');
          if (cachedEvents) setEvents(JSON.parse(cachedEvents));
          const generic = await fetchGenericEvents(20);
          const filtered = generic.filter((e) => !e.isDeleted);
          setEvents(filtered);
          await AsyncStorage.setItem('genericEvents', JSON.stringify(filtered));
          return;
        }

        const [location, interests] = await Promise.all([
          Location.getCurrentPositionAsync({}),
          fetchUserInterests(),
        ]);
        setUserLocation(location.coords);
        setUserInterests(interests);

        const cachedEvents = await AsyncStorage.getItem('hotEvents');
        if (cachedEvents) {
          setEvents(JSON.parse(cachedEvents));
        }

        const newEvents = await fetchHotEvents(interests, location.coords);
        const filteredEvents = newEvents.filter((event) => !event.isDeleted);
        setEvents(filteredEvents);
        await AsyncStorage.setItem('hotEvents', JSON.stringify(filteredEvents));
      } catch (error) {
        console.error('Error preloading data:', error);
      }
    }

    preloadData();
  }, [personalizationEnabled]);

  useEffect(() => {
    if (!personalizationEnabled) {
      // Always load generic feed when personalization is off
      loadEvents(true);
      return;
    }

    if (!userLocation) return;

    const shouldLoad =
      activeTab === 'Hot' ||
      ((activeTab === 'New' ||
        activeTab === 'This Week' ||
        activeTab === 'Today') &&
        selectedInterest);

    if (shouldLoad) {
      setLastDoc(null);
      loadEvents(true);
    }
  }, [activeTab, selectedInterest, userLocation, personalizationEnabled]);

  // Description: Enrich events in the discovery feed with host snippets (cached, batched)
  const enrichEventsWithHosts = useCallback(
    async (eventsToEnrich) => {
      const ownerIds = Array.from(
        new Set(
          (eventsToEnrich || [])
            .map((e) => e.ownerId || e.ownerUID || e.owner)
            .filter(Boolean)
        )
      );
      if (ownerIds.length === 0) return eventsToEnrich;

      try {
        const map = await ensureSnippets(ownerIds);
        return eventsToEnrich.map((e) => {
          const oid = e.ownerId || e.ownerUID || e.owner;
          const s = oid ? map.get(oid) : null;
          if (!s) return e;
          return {
            ...e,
            hostName: s.name || e.hostName,
            hostPhoto: s.photoURL || e.hostPhoto,
            hostRating: s.rating || e.hostRating,
          };
        });
      } catch {
        return eventsToEnrich;
      }
    },
    [ensureSnippets]
  );

  async function loadEvents(reset = false) {
    if (!personalizationEnabled) {
      const generic = await fetchGenericEvents(20);
      const filtered = generic.filter((e) => e.isDeleted !== true);
      setEvents((prev) => (reset ? filtered : [...prev, ...filtered]));
      return;
    }

    if (!userLocation || (activeTab !== 'Hot' && !selectedInterest)) return;

    let newEvents = [];

    if (activeTab === 'Hot') {
      newEvents = await fetchHotEvents(userInterests, userLocation);
    } else if (activeTab === 'New') {
      if (selectedInterest === ALL_LABEL) {
        const results = await Promise.all(
          (userInterests || []).map((i) =>
            fetchNewEvents(i, userLocation, reset ? null : lastDoc)
          )
        );
        newEvents = results.flatMap((r) => r.events || []);
        setLastDoc(null);
      } else {
        const result = await fetchNewEvents(
          selectedInterest,
          userLocation,
          reset ? null : lastDoc
        );
        newEvents = result.events;
        setLastDoc(result.lastDoc);
      }
    } else if (activeTab === 'Today') {
      if (selectedInterest === ALL_LABEL) {
        const results = await Promise.all(
          (userInterests || []).map((i) =>
            fetchTodayEvents(i, userLocation, reset ? null : lastDoc)
          )
        );
        newEvents = results.flatMap((r) => r.events || []);
        setLastDoc(null);
      } else {
        const result = await fetchTodayEvents(
          selectedInterest,
          userLocation,
          reset ? null : lastDoc
        );
        newEvents = result.events;
        setLastDoc(result.lastDoc);
      }
    } else if (activeTab === 'This Week') {
      if (selectedInterest === ALL_LABEL) {
        const results = await Promise.all(
          (userInterests || []).map((i) =>
            fetchThisWeekEvents(i, userLocation, reset ? null : lastDoc)
          )
        );
        newEvents = results.flatMap((r) => r.events || []);
        setLastDoc(null);
      } else {
        if (!selectedInterest) return; // safety
        const result = await fetchThisWeekEvents(
          selectedInterest,
          userLocation,
          reset ? null : lastDoc
        );
        newEvents = result.events;
        setLastDoc(result.lastDoc);
      }
    }

    const enriched = await enrichEventsWithHosts(newEvents);
    setEvents((prevEvents) => {
      const merged = reset ? enriched : [...prevEvents, ...enriched];
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

  const tabs = ['Hot', 'New', 'Today', 'This Week'];

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

      {personalizationEnabled && activeTab !== 'Hot' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          ref={chipScrollViewRef}
        >
          {/* All chip always at the front */}
          <TouchableOpacity
            key={ALL_LABEL}
            style={[
              styles.chip,
              selectedInterest === ALL_LABEL && styles.activeChip,
            ]}
            onPress={() => setSelectedInterest(ALL_LABEL)}
          >
            <Text
              style={[
                styles.chipText,
                selectedInterest === ALL_LABEL && styles.activeChipText,
              ]}
            >
              {ALL_LABEL}
            </Text>
          </TouchableOpacity>

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

      {!personalizationEnabled && (
        <View style={{ backgroundColor: '#fff', padding: 10 }}>
          <Text style={{ color: '#666', fontSize: 12 }}>
            Personalization is off. Showing generic upcoming events.
          </Text>
        </View>
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
        {events.length === 0 ? (
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
                hostName: event.hostName || 'Unknown Host',
                hostPhoto:
                  event.hostPhoto ||
                  require('../../../assets/smileDefault.png'),
                hostRating:
                  typeof event.hostRating === 'number'
                    ? event.hostRating
                    : null,
                formattedDate: event.formattedDate,
                interest: event.interest,
                attendees: event.attendees,
              }}
              onPress={() => {
                try {
                  trackCardClick({
                    card_type: 'event',
                    card_id: event.id,
                    surface: 'discover',
                    interest: event?.interest,
                    category: event?.category,
                  });
                } catch {}
                setPopupEvent(event);
              }}
              onJoinPress={() => setPopupEvent(event)}
            />
          ))
        )}
      </ScrollView>

      {popupEvent && (
        <EventPopupCard
          event={popupEvent}
          onClose={() => setPopupEvent(null)}
          source='card'
          surface='discover'
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
});
