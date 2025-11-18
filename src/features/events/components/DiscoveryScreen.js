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
  Dimensions,
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
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { filterBlockedEvents } from '../utils/blockUtils';
import {
  useDiscoveryLocationStore,
  DEFAULT_DISCOVERY_RADIUS_METERS,
} from '../stores/discoveryLocationStore';

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

const ALL_LABEL = 'All';
const PINNED_INTERESTS_LIMIT = 12;

const arraysEqual = (a = [], b = []) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export default function DiscoveryScreen() {
  const [popupEvent, setPopupEvent] = useState(null);
  const [activeTab, setActiveTab] = useState('Hot');
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [events, setEvents] = useState([]);
  const [posts, setPosts] = useState([]);
  const [userCity, setUserCity] = useState('');
  const [userInterests, setUserInterests] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);

  const chipScrollViewRef = useRef(null);
  const scrollViewRef = useRef(null);
  const hasRefreshedInterestsOnFocusRef = useRef(false);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);
  const user = useUserStore((s) => s.user);
  const personalizationEnabled = !!user?.analyticsOptIn;
  const navigation = useNavigation();
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pinnedInterestsKey = useMemo(() => {
    return user?.uid ? `pinnedInterests_${user.uid}` : null;
  }, [user?.uid]);
  const createPostTutorialKey = useMemo(() => {
    return user?.uid ? `discovery_create_post_tutorial_${user.uid}` : null;
  }, [user?.uid]);
  const [showCreatePostTutorial, setShowCreatePostTutorial] = useState(false);
  const [createPostFabLayout, setCreatePostFabLayout] = useState(null);
  const createPostFabRef = useRef(null);
  const createPostLayoutRef = useRef(null);
  const gpsLocation = useDiscoveryLocationStore((state) => state.gpsLocation);
  const overrideCoords = useDiscoveryLocationStore(
    (state) => state.override?.coords || null
  );
  const overrideRadius = useDiscoveryLocationStore(
    (state) => state.override?.radiusMeters || null
  );
  const gpsRadiusMeters = useDiscoveryLocationStore(
    (state) => state.gpsRadiusMeters || DEFAULT_DISCOVERY_RADIUS_METERS
  );
  const setGpsLocation = useDiscoveryLocationStore(
    (state) => state.setGpsLocation
  );
  const userLocation = useMemo(
    () => overrideCoords || gpsLocation,
    [overrideCoords, gpsLocation]
  );
  const discoveryRadius = useMemo(
    () =>
      overrideRadius ||
      gpsRadiusMeters ||
      DEFAULT_DISCOVERY_RADIUS_METERS,
    [overrideRadius, gpsRadiusMeters]
  );

  const sanitizeInterests = useCallback((list = []) => {
    if (!Array.isArray(list)) return [];
    return list
      .map((interest) => (typeof interest === 'string' ? interest.trim() : ''))
      .filter((interest) => interest.length > 0);
  }, []);

  const parseStoredInterests = useCallback(
    (rawValue) => {
      if (!rawValue) return [];
      try {
        const parsed = JSON.parse(rawValue);
        return sanitizeInterests(parsed);
      } catch (err) {
        console.warn('Failed to parse stored interests:', err?.message || err);
        return [];
      }
    },
    [sanitizeInterests]
  );

  const mergeInterestsWithPinned = useCallback(
    (interests = [], pinned = []) => {
      const normalizedInterests = sanitizeInterests(interests);
      const normalizedPinned = sanitizeInterests(pinned)
        .filter((interest) => normalizedInterests.includes(interest))
        .slice(0, PINNED_INTERESTS_LIMIT);

      const merged = [
        ...normalizedPinned,
        ...normalizedInterests.filter(
          (interest) => !normalizedPinned.includes(interest)
        ),
      ];

      return {
        orderedInterests: merged,
        pinnedSnapshot: normalizedPinned,
      };
    },
    [sanitizeInterests]
  );

  const loadPinnedInterests = useCallback(async () => {
    if (!pinnedInterestsKey) return [];

    try {
      const stored = await AsyncStorage.getItem(pinnedInterestsKey);
      if (stored) {
        return parseStoredInterests(stored).slice(0, PINNED_INTERESTS_LIMIT);
      }

      const legacy = await AsyncStorage.getItem('pinnedInterests');
      if (legacy) {
        const legacyParsed = parseStoredInterests(legacy).slice(
          0,
          PINNED_INTERESTS_LIMIT
        );
        await AsyncStorage.setItem(
          pinnedInterestsKey,
          JSON.stringify(legacyParsed)
        );
        await AsyncStorage.removeItem('pinnedInterests');
        return legacyParsed;
      }
    } catch (err) {
      console.warn('Failed to load pinned interests:', err?.message || err);
    }

    return [];
  }, [parseStoredInterests, pinnedInterestsKey]);

  const persistPinnedSnapshot = useCallback(
    (snapshot = []) => {
      if (!pinnedInterestsKey) return;
      const sanitized = sanitizeInterests(snapshot).slice(
        0,
        PINNED_INTERESTS_LIMIT
      );
      AsyncStorage.setItem(pinnedInterestsKey, JSON.stringify(sanitized)).catch(
        (err) =>
          console.warn(
            'Failed to persist pinned interests:',
            err?.message || err
          )
      );
    },
    [pinnedInterestsKey, sanitizeInterests]
  );

  const applyInterestState = useCallback(
    (orderedInterests = [], pinnedSnapshot = []) => {
      setUserInterests((prev) => {
        if (arraysEqual(prev, orderedInterests)) {
          return prev;
        }
        return orderedInterests;
      });
      setSelectedInterest((prev) => {
        if (prev === ALL_LABEL) return prev;
        return orderedInterests.includes(prev) ? prev : null;
      });
      persistPinnedSnapshot(pinnedSnapshot);
    },
    [persistPinnedSnapshot]
  );

  useEffect(() => {
    // Description: Clear discovery selections when the authenticated user changes
    setUserInterests([]);
    setSelectedInterest(null);
    setEvents([]);
    setPosts([]);
    setLastDoc(null);
  }, [user?.uid]);

  useEffect(() => {
    hasRefreshedInterestsOnFocusRef.current = false;
  }, [personalizationEnabled, user?.uid]);

  useFocusEffect(
    useCallback(() => {
      if (!personalizationEnabled || !user?.uid) {
        return () => {};
      }

      if (!hasRefreshedInterestsOnFocusRef.current) {
        hasRefreshedInterestsOnFocusRef.current = true;
        return () => {};
      }

      let isActive = true;

      (async () => {
        try {
          const [interests, pinned] = await Promise.all([
            fetchUserInterests(),
            loadPinnedInterests(),
          ]);
          if (!isActive) return;
          const { orderedInterests, pinnedSnapshot } =
            mergeInterestsWithPinned(interests, pinned);
          applyInterestState(orderedInterests, pinnedSnapshot);
        } catch (error) {
          console.error('Failed to refresh interests on focus:', error);
        }
      })();

      return () => {
        isActive = false;
      };
    }, [
      personalizationEnabled,
      user?.uid,
      loadPinnedInterests,
      mergeInterestsWithPinned,
      applyInterestState,
    ])
  );

  const blockKey = useMemo(() => {
    const blocked = Array.isArray(user?.blocked)
      ? [...user.blocked].sort().join(',')
      : '';
    const blockedBy = Array.isArray(user?.blockedBy)
      ? [...user.blockedBy].sort().join(',')
      : '';
    return `${blocked}|${blockedBy}`;
  }, [user?.blocked, user?.blockedBy]);

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

  const measureCreatePostFab = useCallback(() => {
    const ref = createPostFabRef.current;
    if (!ref || typeof ref.measureInWindow !== 'function') return;
    ref.measureInWindow((x, y, width, height) => {
      if (!width && !height) return;
      const layout = { x, y, width, height };
      createPostLayoutRef.current = layout;
      setCreatePostFabLayout((prev) => {
        if (
          prev &&
          Math.abs(prev.x - layout.x) < 1 &&
          Math.abs(prev.y - layout.y) < 1 &&
          Math.abs(prev.width - layout.width) < 1 &&
          Math.abs(prev.height - layout.height) < 1
        ) {
          return prev;
        }
        return layout;
      });
    });
  }, []);

  const handleCreatePostFabLayout = useCallback(() => {
    measureCreatePostFab();
  }, [measureCreatePostFab]);

  useEffect(() => {
    if (!showCreatePostTutorial) return;
    const timer = setTimeout(() => {
      measureCreatePostFab();
    }, 220);

    let subscription;
    if (typeof Dimensions?.addEventListener === 'function') {
      subscription = Dimensions.addEventListener(
        'change',
        measureCreatePostFab
      );
    }

    return () => {
      clearTimeout(timer);
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [measureCreatePostFab, showCreatePostTutorial]);

  const dismissCreatePostTutorial = useCallback(async () => {
    setShowCreatePostTutorial(false);
    setCreatePostFabLayout(null);
    createPostLayoutRef.current = null;
    if (!createPostTutorialKey) return;
    try {
      await AsyncStorage.setItem(createPostTutorialKey, 'true');
    } catch (err) {
      console.warn('Discovery tutorial write failed:', err?.message || err);
    }
  }, [createPostTutorialKey]);

  const createPostHighlightStyle = useMemo(() => {
    if (!showCreatePostTutorial || !createPostFabLayout) return null;
    const windowSize = Dimensions.get('window');
    const size =
      Math.max(createPostFabLayout.width, createPostFabLayout.height) + 36;
    const provisionalTop =
      createPostFabLayout.y + createPostFabLayout.height / 2 - size / 2;
    const provisionalLeft =
      createPostFabLayout.x + createPostFabLayout.width / 2 - size / 2;
    return {
      top: Math.max(Math.min(provisionalTop, windowSize.height - size), 0),
      left: Math.max(Math.min(provisionalLeft, windowSize.width - size), 0),
      width: size,
      height: size,
      borderRadius: size / 2,
    };
  }, [createPostFabLayout, showCreatePostTutorial]);

  const createPostTooltipPosition = useMemo(() => {
    if (!showCreatePostTutorial) return null;
    const windowSize = Dimensions.get('window');
    const tooltipWidth = 280;
    const fallback = {
      top: Math.max(
        Math.min(windowSize.height * 0.4, windowSize.height - 220),
        16
      ),
      left: Math.max(
        Math.min(
          (windowSize.width - tooltipWidth) / 2,
          windowSize.width - tooltipWidth - 16
        ),
        16
      ),
      width: tooltipWidth,
    };

    if (!createPostFabLayout) return fallback;

    const top = Math.max(createPostFabLayout.y - 170, 16);
    const left = Math.max(
      Math.min(
        createPostFabLayout.x + createPostFabLayout.width - tooltipWidth,
        windowSize.width - tooltipWidth - 16
      ),
      16
    );
    return { top, left, width: tooltipWidth };
  }, [createPostFabLayout, showCreatePostTutorial]);

  const createPostTutorialCopy = useMemo(
    () => ({
      title: 'Create an interest post',
      description:
        'Share photos, plans, or updates with your interests. Posts show up in Discovery and for people who follow you.',
      cta: 'Got it',
    }),
    []
  );

  useEffect(() => {
    if (!createPostTutorialKey) {
      setShowCreatePostTutorial(false);
      setCreatePostFabLayout(null);
      createPostLayoutRef.current = null;
      return;
    }

    // Description: Only show tutorial for new users (created within last 7 days)
    const isNewUser = () => {
      if (!user?.createdAt) return false;
      try {
        const createdDate =
          user.createdAt?.toDate?.() || new Date(user.createdAt);
        const daysSinceCreation =
          (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCreation <= 7;
      } catch (e) {
        console.warn('Error checking user creation date:', e);
        return false;
      }
    };

    let isMounted = true;
    AsyncStorage.getItem(createPostTutorialKey)
      .then((value) => {
        if (!isMounted) return;
        // Only show if: not dismissed before AND user is new
        setShowCreatePostTutorial(value !== 'true' && isNewUser());
      })
      .catch((err) => {
        console.warn('Discovery tutorial load failed:', err?.message || err);
        if (!isMounted) return;
        // Default to showing only for new users
        setShowCreatePostTutorial(isNewUser());
      });

    return () => {
      isMounted = false;
    };
  }, [createPostTutorialKey, user?.createdAt]);

  useEffect(() => {
    setEvents((prev) => {
      const filtered = filterBlockedEvents(prev, user);
      if (
        filtered.length === prev.length &&
        filtered.every((event, idx) => event.id === prev[idx]?.id)
      ) {
        return prev;
      }
      return filtered;
    });
  }, [blockKey]);

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
        return (eventsToEnrich || []).map((e) => {
          const oid = e?.ownerId || e?.ownerUID || e?.owner;
          const s = oid ? map.get(oid) : null;
          if (!s) return e;
          return {
            ...e,
            hostName: s.name || e?.hostName,
            hostPhoto: s.photoURL || e?.hostPhoto,
            hostRating: s.rating || e?.hostRating,
            hostVerified: s?.verification?.status === 'verified',
          };
        });
      } catch (error) {
        console.warn('Discovery enrich hosts failed:', error?.message || error);
        return eventsToEnrich;
      }
    },
    [ensureSnippets]
  );

  useEffect(() => {
    let isMounted = true;

    async function initializeUserData() {
      try {
        // If personalization is disabled, don't request location or interests here
        if (!personalizationEnabled) {
          if (!isMounted) return;
          setUserCity('');
          setUserInterests([]);
          const generic = await fetchGenericEvents(20);
          if (!isMounted) return;
          const visibleGeneric = filterBlockedEvents(
            generic.filter((e) => e.isDeleted !== true),
            user
          );
          const enrichedGeneric = await enrichEventsWithHosts(visibleGeneric);
          if (!isMounted) return;
          setEvents(enrichedGeneric);
          if (!isMounted) return;
          setPosts([]);
          return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const location = await Location.getCurrentPositionAsync({});
        if (!isMounted) return;
        setGpsLocation({ coords: location.coords });

        const geocode = await Location.reverseGeocodeAsync(location.coords);
        if (!isMounted) return;
        const city = geocode[0]?.city || '';
        setUserCity(city);
        setGpsLocation({ coords: location.coords, label: city });

        const interests = await fetchUserInterests();
        const pinned = await loadPinnedInterests();
        const { orderedInterests, pinnedSnapshot } = mergeInterestsWithPinned(
          interests,
          pinned
        );

        if (!isMounted) return;
        applyInterestState(orderedInterests, pinnedSnapshot);
      } catch (error) {
        console.error('Error initializing user data:', error);
      }
    }

    initializeUserData();

    return () => {
      isMounted = false;
    };
  }, [
    personalizationEnabled,
    loadPinnedInterests,
    mergeInterestsWithPinned,
    pinnedInterestsKey,
    applyInterestState,
    enrichEventsWithHosts,
    user,
    user?.uid,
    setGpsLocation,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function preloadData() {
      try {
        if (!personalizationEnabled) {
          const cachedEvents = await AsyncStorage.getItem('genericEvents');
          if (cachedEvents && isMounted) {
            try {
              const parsed = JSON.parse(cachedEvents);
              const visibleCached = filterBlockedEvents(parsed, user);
              const enrichedCached = await enrichEventsWithHosts(visibleCached);
              if (!isMounted) return;
              setEvents(enrichedCached);
            } catch (err) {
              console.warn('Failed to parse cached generic events:', err);
            }
          }
          const generic = await fetchGenericEvents(20);
          if (!isMounted) return;
          const filtered = generic.filter((e) => !e.isDeleted);
          const visibleFresh = filterBlockedEvents(filtered, user);
          const enrichedFresh = await enrichEventsWithHosts(visibleFresh);
          if (!isMounted) return;
          setEvents(enrichedFresh);
          await AsyncStorage.setItem('genericEvents', JSON.stringify(filtered));
          if (!isMounted) return;
          setPosts([]);
          return;
        }

        const [location, interests, pinned] = await Promise.all([
          Location.getCurrentPositionAsync({}),
          fetchUserInterests(),
          loadPinnedInterests(),
        ]);

        if (!isMounted) return;
        setGpsLocation({ coords: location.coords });

        const { orderedInterests, pinnedSnapshot } = mergeInterestsWithPinned(
          interests,
          pinned
        );
        applyInterestState(orderedInterests, pinnedSnapshot);

        const cachedEvents = await AsyncStorage.getItem('hotEvents');
        if (cachedEvents && isMounted) {
          try {
            const parsed = JSON.parse(cachedEvents);
            const visibleCached = filterBlockedEvents(parsed, user);
            const enrichedCached = await enrichEventsWithHosts(visibleCached);
            if (!isMounted) return;
            setEvents(enrichedCached);
          } catch (err) {
            console.warn('Failed to parse cached hot events:', err);
          }
        }

        const locationStoreState = useDiscoveryLocationStore.getState();
        const coordsForFetch =
          locationStoreState.override?.coords || location.coords;
        const radiusForFetch =
          locationStoreState.override?.radiusMeters ||
          locationStoreState.gpsRadiusMeters ||
          DEFAULT_DISCOVERY_RADIUS_METERS;
        const newEvents = coordsForFetch
          ? await fetchHotEvents(
              orderedInterests,
              coordsForFetch,
              radiusForFetch
            )
          : [];
        if (!isMounted) return;
        const filteredEvents = newEvents.filter((event) => !event.isDeleted);
        const visibleEvents = filterBlockedEvents(filteredEvents, user);
        const enrichedEvents = await enrichEventsWithHosts(visibleEvents);
        if (!isMounted) return;
        setEvents(enrichedEvents);
        await AsyncStorage.setItem('hotEvents', JSON.stringify(filteredEvents));
      } catch (error) {
        console.error('Error preloading data:', error);
      }
    }

    preloadData();

    return () => {
      isMounted = false;
    };
  }, [
    personalizationEnabled,
    loadPinnedInterests,
    mergeInterestsWithPinned,
    pinnedInterestsKey,
    applyInterestState,
    enrichEventsWithHosts,
    user,
    user?.uid,
    setGpsLocation,
  ]);

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
    discoveryRadius,
  ]);

  async function loadEvents(reset = false) {
    if (!personalizationEnabled) {
      const generic = await fetchGenericEvents(20);
      const visibleGeneric = filterBlockedEvents(
        generic.filter((e) => e.isDeleted !== true),
        user
      );
      const enrichedGeneric = await enrichEventsWithHosts(visibleGeneric);
      setEvents((prev) => {
        const base = reset ? [] : prev;
        const merged = [...base, ...enrichedGeneric];
        const uniqueById = merged.filter(
          (event, index, self) =>
            index === self.findIndex((candidate) => candidate.id === event.id)
        );
        return filterBlockedEvents(uniqueById, user);
      });
      return;
    }

    if (!userLocation || (activeTab !== 'Hot' && !selectedInterest)) return;

    if (activeTab === 'Hot' && (!userInterests || userInterests.length === 0))
      return;

    let newEvents = [];
    let fetchedPosts = [];

    if (activeTab === 'Hot') {
      newEvents = await fetchHotEvents(
        userInterests,
        userLocation,
        discoveryRadius
      );
    } else if (activeTab === 'New') {
      if (selectedInterest === ALL_LABEL) {
        const results = await Promise.all(
          (userInterests || []).map((i) =>
            fetchNewEvents(
              i,
              userLocation,
              reset ? null : lastDoc,
              undefined,
              discoveryRadius
            )
          )
        );
        newEvents = results.flatMap((r) => r.events || []);
        setLastDoc(null);
      } else {
        const result = await fetchNewEvents(
          selectedInterest,
          userLocation,
          reset ? null : lastDoc,
          undefined,
          discoveryRadius
        );
        newEvents = result.events;
        setLastDoc(result.lastDoc);
      }
    } else if (activeTab === 'Today') {
      if (selectedInterest === ALL_LABEL) {
        const results = await Promise.all(
          (userInterests || []).map((i) =>
            fetchTodayEvents(
              i,
              userLocation,
              reset ? null : lastDoc,
              undefined,
              discoveryRadius
            )
          )
        );
        newEvents = results.flatMap((r) => r.events || []);
        setLastDoc(null);
      } else {
        const result = await fetchTodayEvents(
          selectedInterest,
          userLocation,
          reset ? null : lastDoc,
          undefined,
          discoveryRadius
        );
        newEvents = result.events;
        setLastDoc(result.lastDoc);
      }
    } else if (activeTab === 'This Week') {
      if (selectedInterest === ALL_LABEL) {
        const results = await Promise.all(
          (userInterests || []).map((i) =>
            fetchThisWeekEvents(
              i,
              userLocation,
              reset ? null : lastDoc,
              undefined,
              discoveryRadius
            )
          )
        );
        newEvents = results.flatMap((r) => r.events || []);
        setLastDoc(null);
      } else {
        if (!selectedInterest) return; // safety
        const result = await fetchThisWeekEvents(
          selectedInterest,
          userLocation,
          reset ? null : lastDoc,
          undefined,
          discoveryRadius
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

    const visibleNewEvents = filterBlockedEvents(
      (newEvents || []).filter((event) => event && event.isDeleted !== true),
      user
    );
    const enriched = await enrichEventsWithHosts(visibleNewEvents);
    setEvents((prevEvents) => {
      const base = reset ? [] : prevEvents;
      const merged = [...base, ...enriched];
      const uniqueById = merged.filter(
        (event, index, self) =>
          index === self.findIndex((e) => e.id === event.id)
      );
      return filterBlockedEvents(uniqueById, user);
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
    const [normalizedInterest] = sanitizeInterests([interest]);
    if (!normalizedInterest) return;

    setUserInterests((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const updated = [
        normalizedInterest,
        ...base.filter((i) => i !== normalizedInterest),
      ];
      persistPinnedSnapshot(updated);
      return updated;
    });
    setSelectedInterest(normalizedInterest);
  }

  function selectInterest(interest) {
    const [normalizedInterest] = sanitizeInterests([interest]);
    if (!normalizedInterest) return;

    setUserInterests((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const updated = [
        normalizedInterest,
        ...base.filter((i) => i !== normalizedInterest),
      ];
      persistPinnedSnapshot(updated);
      return updated;
    });
    setSelectedInterest(normalizedInterest);
    chipScrollViewRef.current?.scrollTo({ x: 0, animated: true });
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents(true);
    setRefreshing(false);
  };

  const tabs = ['Hot', 'New', 'Today', 'This Week'];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      {showCreatePostTutorial && (
        <View style={styles.tutorialOverlay} pointerEvents='auto'>
          <View style={styles.tutorialBackdrop} />
          {createPostHighlightStyle && (
            <View
              pointerEvents='none'
              style={[styles.tutorialHighlight, createPostHighlightStyle]}
            />
          )}
          {createPostTooltipPosition && (
            <View
              style={[styles.tutorialTooltip, createPostTooltipPosition]}
              accessibilityLabel='Discovery tutorial tooltip'
            >
              <Text style={styles.tutorialTitle}>
                {createPostTutorialCopy.title}
              </Text>
              <Text style={styles.tutorialDescription}>
                {createPostTutorialCopy.description}
              </Text>
              <TouchableOpacity
                style={styles.tutorialButton}
                onPress={dismissCreatePostTutorial}
                accessibilityRole='button'
                accessibilityLabel='Dismiss discovery tutorial'
              >
                <Text style={styles.tutorialButtonText}>
                  {createPostTutorialCopy.cta}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.card,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Discovery
        </Text>
      </View>

      <View
        style={[styles.tabRow, { backgroundColor: theme.colors.background }]}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && [
                styles.activeTab,
                { backgroundColor: theme.colors.primary },
              ],
            ]}
            onPress={() => {
              setActiveTab(tab);
              if (tab === 'Hot') setSelectedInterest(null);
            }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && [
                  styles.activeTabText,
                  { color: theme.colors.neutral100 },
                ],
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
                selectedInterest === interest && [
                  styles.activeChip,
                  { backgroundColor: theme.colors.primary },
                ],
              ]}
              onPress={() => selectInterest(interest)}
              onLongPress={() => pinInterest(interest)}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedInterest === interest && [
                    styles.activeChipText,
                    { color: theme.colors.neutral100 },
                  ],
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            title=''
          />
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
        ref={createPostFabRef}
        onLayout={handleCreatePostFabLayout}
        style={styles.createPostFab}
        onPress={() => setShowCreatePost(true)}
        activeOpacity={0.85}
      >
        <Ionicons
          name='create-outline'
          size={26}
          color={theme.colors.fabForeground}
        />
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

// Description: Create theme-aware styles for DiscoveryScreen
const createStyles = (theme) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    tutorialOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
    },
    tutorialBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    tutorialHighlight: {
      position: 'absolute',
      borderColor: theme.colors.neutral100,
      borderWidth: 2,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    tutorialTooltip: {
      position: 'absolute',
      padding: 16,
      borderRadius: 12,
      backgroundColor: theme.colors.tooltipBackground,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 12,
    },
    tutorialTitle: {
      color: theme.colors.tooltipText,
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 6,
    },
    tutorialDescription: {
      color: theme.colors.tooltipText,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
    },
    tutorialButton: {
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.primary,
      paddingVertical: 8,
      paddingHorizontal: 18,
      borderRadius: 20,
    },
    tutorialButtonText: {
      color: theme.colors.neutral100,
      fontSize: 14,
      fontWeight: '600',
    },
    header: {
      paddingTop: 10,
      paddingBottom: 15,
      paddingHorizontal: 16,
      backgroundColor: theme.colors.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.text,
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
      backgroundColor: theme.colors.card,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    tab: {
      backgroundColor: theme.colors.chipBackground,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 15,
      marginRight: 8,
    },
    activeTab: {
      backgroundColor: theme.colors.chipBackgroundActive,
    },
    tabText: {
      color: theme.colors.chipText,
      fontWeight: '600',
    },
    activeTabText: {
      color: theme.colors.chipTextActive,
    },
    chipRow: {
      backgroundColor: theme.colors.card,
      paddingVertical: 6,
      paddingLeft: 10,
      marginBottom: 6,
      maxHeight: 46,
    },
    chip: {
      backgroundColor: theme.colors.chipBackground,
      paddingVertical: 4,
      paddingHorizontal: 12,
      borderRadius: 15,
      marginRight: 8,
      alignSelf: 'center',
    },
    activeChip: {
      backgroundColor: theme.colors.chipBackgroundActive,
    },
    chipText: {
      color: theme.colors.chipText,
      fontWeight: '500',
      fontSize: 14,
    },
    activeChipText: {
      color: theme.colors.chipTextActive,
    },
    emptyMessage: {
      textAlign: 'center',
      marginTop: 20,
      fontSize: 16,
      color: theme.colors.textSecondary,
    },
    createPostFab: {
      position: 'absolute',
      right: 24,
      bottom: 32,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.fabBackground,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 8,
      elevation: 6,
    },
  });
