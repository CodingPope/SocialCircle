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
} from '../services/discoveryQueries';
import PostCard from './PostCard';
import InterestPostCard from '../../interestPosts/components/InterestPostCard';
import CreateInterestPostModal from '../../interestPosts/components/CreateInterestPostModal';
import {
  fetchInterestPostsByInterest,
  fetchInterestPostsForInterests,
  InterestTimeframes,
} from '../../interestPosts/services/interestPostService';
import { fetchUserInterests } from '../../profile/services/userQueries';
import EventPopupCard from './EventPopUpCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import { useUserStore } from '../../profile/stores/userStore';
import {
  screen as trackScreen,
  event as trackEvent,
} from '../../../services/analytics';
import { trackCardClick } from '../../../lib/analytics';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function getItemTimestamp(item) {
  if (!item) return 0;
  if (item.type === 'post') return toMillis(item.post?.createdAt);
  if (item.type === 'event')
    return (
      toMillis(item.event?.createdAt) ||
      toMillis(item.event?.date) ||
      toMillis(item.event?.startAt)
    );
  return 0;
}

const TAB_TO_TIMEFRAME = {
  New: InterestTimeframes.NEW,
  Today: InterestTimeframes.TODAY,
  'This Week': InterestTimeframes.WEEK,
};

export default function DiscoveryScreen() {
  const [popupEvent, setPopupEvent] = useState(null);
  const [activeTab, setActiveTab] = useState('Hot');
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [events, setEvents] = useState([]);
  const [posts, setPosts] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [userCity, setUserCity] = useState('');
  const [userInterests, setUserInterests] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);

  const chipScrollViewRef = useRef(null);
  const scrollViewRef = useRef(null);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);
  const user = useUserStore((s) => s.user);
  const personalizationEnabled = !!user?.analyticsOptIn;
  const navigation = useNavigation();

  const ALL_LABEL = 'All';

  const feedItems = useMemo(() => {
    const eventItems = (events || []).map((event) => ({
      type: 'event',
      id: `event-${event.id}`,
      event,
    }));
    const postItems = (posts || []).map((post) => ({
      type: 'post',
      id: `post-${post.id}`,
      post,
    }));
    const seen = new Set();
    return [...eventItems, ...postItems]
      .filter((item) => {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a));
  }, [events, posts]);

  const handlePostDeleted = useCallback((postId) => {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
  }, []);

  const openPost = useCallback(
    (post) => {
      if (!post?.id) return;
      try {
        trackEvent('post_open', {
          post_id: post.id,
          interest: post.interestId || null,
          surface: 'discover',
        });
      } catch {}
      navigation.navigate('InterestPost', {
        postId: post.id,
        initialPost: post,
      });
    },
    [navigation]
  );

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
          setPosts([]);
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
          setPosts([]);
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

    if (activeTab === 'Hot' && (!userInterests || userInterests.length === 0))
      return;

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
  }, [
    activeTab,
    selectedInterest,
    userLocation,
    personalizationEnabled,
    userInterests,
  ]);

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

    if (activeTab === 'Hot' && (!userInterests || userInterests.length === 0))
      return;

    let newEvents = [];
    let fetchedPosts = [];

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

    if (
      personalizationEnabled &&
      activeTab !== 'Hot' &&
      (selectedInterest || selectedInterest === ALL_LABEL)
    ) {
      const timeframe = TAB_TO_TIMEFRAME[activeTab] || InterestTimeframes.WEEK;
      try {
        if (selectedInterest === ALL_LABEL) {
          const interestIds = (userInterests || []).slice(0, 10);
          if (interestIds.length) {
            fetchedPosts = await fetchInterestPostsForInterests({
              interestIds,
              timeframe,
              pageSizePerInterest: 6,
            });
          }
        } else if (selectedInterest) {
          const result = await fetchInterestPostsByInterest({
            interestId: selectedInterest,
            timeframe,
            pageSize: 20,
          });
          fetchedPosts = result.posts || [];
        }
      } catch (err) {
        console.warn('Failed to fetch interest posts', err);
      }
    } else if (!personalizationEnabled) {
      fetchedPosts = [];
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

    setPosts(fetchedPosts.filter((post) => post?.isDeleted !== true));
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
        contentContainerStyle={styles.feedContent}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        ref={scrollViewRef}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {feedItems.length === 0 ? (
          <Text style={styles.emptyMessage}>No events or posts found</Text>
        ) : (
          feedItems.map((item) => {
            if (item.type === 'post') {
              return (
                <InterestPostCard
                  key={item.id}
                  post={item.post}
                  onPress={() => openPost(item.post)}
                  onDeleted={() => handlePostDeleted(item.post.id)}
                />
              );
            }

            const event = item.event;
            if (!event) return null;

            return (
              <PostCard
                key={item.id}
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
                    require('../../../../assets/smileDefault.png'),
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
            );
          })
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

      <TouchableOpacity
        style={styles.createPostFab}
        onPress={() => setShowCreatePost(true)}
        activeOpacity={0.85}
      >
        <Ionicons name='create-outline' size={26} color='#fff' />
      </TouchableOpacity>

      <CreateInterestPostModal
        visible={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onCreated={(created) => {
          setShowCreatePost(false);
          if (created?.interestId) {
            setSelectedInterest((prev) => prev || created.interestId);
          }
          setPosts((prev) => [created, ...prev]);
          setTimeout(() => loadEvents(true), 200);
        }}
      />
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
  feedContent: {
    paddingBottom: 120,
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
  createPostFab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
});
