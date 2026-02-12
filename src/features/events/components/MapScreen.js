import React, {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { db } from '../../../services/firebase';
import { doc, getDoc } from '../../../services/firebase/firestoreCompat';
import { useUserStore } from '../../profile/stores/userStore';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import CreateEventScreen from './CreateEventScreen';
import { GOOGLE_MAPS_API_KEY } from '@env';
import EventListView from './EventListView';
import EventFilterWindow from './EventFilterWindow';
import EventPopUpCard from './EventPopUpCard';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { Ionicons } from '@expo/vector-icons';
// NEW: previews + markers
import BlipMarker from './map/BlipMarker';
import BlipPreview from './map/BlipPreview';
import { CategoryMarker } from './map/CategoryMarker';

// Extracted components (available for progressive migration)
// import MapTutorialOverlay from './map/MapTutorialOverlay';
// import MapQuickDateFilters from './map/MapQuickDateFilters';
// import CreateEventFAB from './map/CreateEventFAB';
// import MapSearchBar from './map/MapSearchBar';

import { Dimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEventStore } from '../stores/eventStore';
import {
  useDiscoveryLocationStore,
  DEFAULT_DISCOVERY_RADIUS_METERS,
  MIN_DISCOVERY_RADIUS_METERS,
  MAX_DISCOVERY_RADIUS_METERS,
} from '../stores/discoveryLocationStore';
import joinEvent from '../api/joinEventService';
import { trackCardClick, trackOpenEvent } from '../../../lib/analytics';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
import { darkMapStyle, lightMapStyle } from '../constants/mapStyles';
import {
  resolveLocationWithFallback,
  ensureForegroundPermission,
} from '../utils/locationResolver';
import { eventPassesGenderGate } from '../utils/genderUtils';
import useDiscoveryFeed from '../hooks/useDiscoveryFeed';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PREVIEW_WIDTH = Math.min(284, SCREEN_W - 16); // tighter footprint
const PREVIEW_HEIGHT = 118; // matches polished card height
const POINTER_HEIGHT = 12; // must match BlipPreview triangle height
const POINTER_MARGIN = -2; // allow card to sit closer to the marker
const MARKER_VISUAL_OFFSET = 6; // approximate radius of the map blip so the bubble sits on top
const PREVIEW_VERTICAL_GAP = 16; // slight cushion between marker and card
const PREVIEW_BUBBLE_CENTER = 88; // px from card left where the bubble naturally sits
const PREVIEW_BUBBLE_WINDOW = 18; // allowable drift before re-centering
const PREVIEW_TOP_CHROME = 52; // search bar + filter bar height
const PREVIEW_IDLE_DELAY_MS = 1000;
const PREVIEW_COOLDOWN_MS = 5000;
const MIN_ANCHOR_DIST = 110; // px separation between previews
const MAX_EVENT_PREVIEWS = 1; // limit to a single event preview; reserve space for ads later
const BADGE_ANCHOR_OFFSET = 10; // horizontal shift when attendee badge shows
const BADGE_VERTICAL_OFFSET = 12; // vertical lift when badge is visible

const GOOGLE_PLACES_API_KEY = GOOGLE_MAPS_API_KEY;

const QUICK_DATE_FILTERS = [
  { key: 'today', label: 'Today', startOffset: 0, endOffset: 0 },
  { key: 'tomorrow', label: 'Tomorrow', startOffset: 1, endOffset: 1 },
  { key: 'week', label: 'This Week', startOffset: 0, endOffset: 6 },
];

const METERS_PER_DEGREE_LAT = 111320;
const MIN_COS_LAT = 0.01;

const clampRadiusToDiscoveryBounds = (value) =>
  Math.min(
    Math.max(
      typeof value === 'number' && !Number.isNaN(value)
        ? value
        : DEFAULT_DISCOVERY_RADIUS_METERS,
      MIN_DISCOVERY_RADIUS_METERS,
    ),
    MAX_DISCOVERY_RADIUS_METERS,
  );

const deriveRadiusFromRegion = (region) => {
  if (!region) return DEFAULT_DISCOVERY_RADIUS_METERS;
  const latDelta = Math.abs(region.latitudeDelta || 0);
  const lngDelta = Math.abs(region.longitudeDelta || 0);
  const centerLat = region.latitude || 0;
  const latMeters = latDelta * METERS_PER_DEGREE_LAT;
  const lngMeters =
    lngDelta *
    METERS_PER_DEGREE_LAT *
    Math.max(Math.cos((centerLat * Math.PI) / 180), MIN_COS_LAT);
  const estimatedRadius = Math.max(latMeters, lngMeters) / 2;
  const fallback = latMeters || lngMeters || DEFAULT_DISCOVERY_RADIUS_METERS;
  return clampRadiusToDiscoveryBounds(estimatedRadius || fallback);
};

const buildRegionFromContext = (
  coords,
  radiusMeters = DEFAULT_DISCOVERY_RADIUS_METERS,
) => {
  if (!coords) return null;
  const latDelta =
    ((radiusMeters || DEFAULT_DISCOVERY_RADIUS_METERS) * 2) /
    METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(
    Math.cos((coords.latitude * Math.PI) / 180),
    MIN_COS_LAT,
  );
  const lngDelta = latDelta / cosLat;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    latitudeDelta: latDelta || 0.05,
    longitudeDelta: lngDelta || 0.05,
  };
};

export default function MapScreen() {
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);
  const navigation = useNavigation();
  const route = useRoute();
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const mapAppearance = useMemo(
    () => ({
      customStyle: themeMode === 'dark' ? darkMapStyle : lightMapStyle,
      userInterfaceStyle: themeMode === 'dark' ? 'dark' : 'light',
    }),
    [themeMode],
  );

  const renderCustomDotMarker = useCallback(
    (color, label = null, scale = 1) => (
      <View
        style={[styles.dot, { backgroundColor: color, transform: [{ scale }] }]}
      >
        {label ? <Text style={styles.dotLabel}>{label}</Text> : null}
      </View>
    ),
    [styles],
  );

  const tutorialKeys = useMemo(() => {
    if (!user?.uid) return null;
    return {
      create: `map_create_fab_tutorial_${user.uid}`,
      filter: `map_filter_tutorial_${user.uid}`,
    };
  }, [user?.uid]);

  if (!user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size='large' color={theme.colors.primary} />
      </View>
    );
  }

  const userInterests = Array.isArray(user?.interests) ? user.interests : [];

  const {
    events,
    filteredEvents,
    optimisticEvents,
    setOptimisticEvents,
    selectedFilters,
    setSelectedFilters,
    initialLoading,
    setInitialLoading,
    fetchEventsInRegion,
    applyFilters,
  } = useDiscoveryFeed(user);
  const [newEventLocation, setNewEventLocation] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [region, setRegion] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  const [showListView, setShowListView] = useState(false);
  const [showFilterWindow, setShowFilterWindow] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activeTutorial, setActiveTutorial] = useState(null);
  const [pendingTutorial, setPendingTutorial] = useState(null);
  const [tutorialProgress, setTutorialProgress] = useState({
    create: true,
    filter: true,
  });
  const [tutorialLayouts, setTutorialLayouts] = useState({
    create: null,
    filter: null,
  });

  // Debug selectedEvent changes
  useEffect(() => {
    // selectedEvent change monitored during debugging; removed verbose logging
  }, [selectedEvent]);
  // NEW: previews state
  const [previewItems, setPreviewItems] = useState([]);
  const previewsIdleTimerRef = useRef(null);
  const previewsCooldownRef = useRef(0);
  const previewRotationRef = useRef({ signature: null, nextIndex: 0 });
  const mapRef = useRef(null);
  const eventStoreRef = useRef(useEventStore.getState());
  const createFabRef = useRef(null);
  const filterButtonRef = useRef(null);
  const latestLayoutsRef = useRef({
    create: null,
    filter: null,
  });
  const tutorialOpacity = useRef(new Animated.Value(0)).current;
  const lastInteractionRef = useRef(Date.now());
  const skipNextRegionSyncRef = useRef(false);
  const setGpsLocation = useDiscoveryLocationStore(
    (state) => state.setGpsLocation,
  );
  const setMapOverride = useDiscoveryLocationStore(
    (state) => state.setMapOverride,
  );
  const clearOverride = useDiscoveryLocationStore(
    (state) => state.clearOverride,
  );

  const [isLocating, setIsLocating] = useState(false);
  // Description: Track location permission state for contextual prompt (SC-104)
  const [locationPermission, setLocationPermission] = useState('undetermined');

  const [isSearchFocused, setIsSearchFocused] = useState(false); // ✅ TRACKS DROPDOWN STATE

  const hasInitializedInterestsRef = useRef(false);

  const markInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!tutorialKeys) {
      setTutorialProgress({ create: true, filter: true });
      setActiveTutorial(null);
      setPendingTutorial(null);
      setTutorialLayouts({ create: null, filter: null });
      latestLayoutsRef.current = { create: null, filter: null };
      return;
    }

    let isMounted = true;
    Promise.all([
      AsyncStorage.getItem(tutorialKeys.create),
      AsyncStorage.getItem(tutorialKeys.filter),
    ])
      .then(([createValue, filterValue]) => {
        if (!isMounted) return;
        const progress = {
          create: createValue === 'true',
          filter: filterValue === 'true',
        };
        setTutorialProgress(progress);
        const nextTutorial = !progress.create
          ? 'create'
          : !progress.filter
            ? 'filter'
            : null;
        setActiveTutorial(null);
        setPendingTutorial(nextTutorial);
        setTutorialLayouts({ create: null, filter: null });
        latestLayoutsRef.current = { create: null, filter: null };
      })
      .catch((err) => {
        console.warn('Map tutorials load failed:', err?.message || err);
        if (!isMounted) return;
        const progress = { create: false, filter: false };
        setTutorialProgress(progress);
        setActiveTutorial(null);
        setPendingTutorial('create');
        setTutorialLayouts({ create: null, filter: null });
        latestLayoutsRef.current = { create: null, filter: null };
      });

    return () => {
      isMounted = false;
    };
  }, [tutorialKeys]);

  const measureTutorialTarget = useCallback((type) => {
    const ref =
      type === 'create' ? createFabRef.current : filterButtonRef.current;
    if (!ref || typeof ref.measureInWindow !== 'function') return;
    ref.measureInWindow((x, y, width, height) => {
      if (!width && !height) return;
      const layout = { x, y, width, height };
      latestLayoutsRef.current[type] = layout;
      setTutorialLayouts((prev) => {
        const prevLayout = prev[type];
        if (
          prevLayout &&
          Math.abs(prevLayout.x - layout.x) < 1 &&
          Math.abs(prevLayout.y - layout.y) < 1 &&
          Math.abs(prevLayout.width - layout.width) < 1 &&
          Math.abs(prevLayout.height - layout.height) < 1
        ) {
          return prev;
        }
        return { ...prev, [type]: layout };
      });
    });
  }, []);

  const handleCreateFabLayout = useCallback(() => {
    measureTutorialTarget('create');
  }, [measureTutorialTarget]);

  useEffect(() => {
    if (!activeTutorial) return;
    tutorialOpacity.setValue(0);
    Animated.timing(tutorialOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeTutorial, tutorialOpacity]);

  const handleFilterButtonLayout = useCallback(() => {
    measureTutorialTarget('filter');
  }, [measureTutorialTarget]);

  useEffect(() => {
    if (!activeTutorial) return;
    const timer = setTimeout(() => {
      measureTutorialTarget(activeTutorial);
    }, 220);

    let subscription;
    if (typeof Dimensions?.addEventListener === 'function') {
      subscription = Dimensions.addEventListener('change', () =>
        measureTutorialTarget(activeTutorial),
      );
    }

    return () => {
      clearTimeout(timer);
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, [activeTutorial, measureTutorialTarget]);

  useEffect(() => {
    if (!pendingTutorial || activeTutorial || !mapReady) return;

    let cancelled = false;
    const baseDelay = pendingTutorial === 'create' ? 1400 : 1100;

    const ensureLayout = () => {
      if (!latestLayoutsRef.current[pendingTutorial]) {
        measureTutorialTarget(pendingTutorial);
      }
    };

    ensureLayout();

    let rescheduleTimer;
    const attemptShow = () => {
      if (cancelled) return;
      ensureLayout();
      if (Date.now() - lastInteractionRef.current < 900) {
        rescheduleTimer = setTimeout(attemptShow, 600);
        return;
      }
      setActiveTutorial(pendingTutorial);
      setPendingTutorial(null);
    };

    const delayTimer = setTimeout(attemptShow, baseDelay);
    return () => {
      cancelled = true;
      clearTimeout(delayTimer);
      if (rescheduleTimer) clearTimeout(rescheduleTimer);
    };
  }, [pendingTutorial, activeTutorial, mapReady, measureTutorialTarget]);

  const dismissActiveTutorial = useCallback(() => {
    if (!activeTutorial) return;
    const current = activeTutorial;
    const storageKey = tutorialKeys?.[current];
    const queueFilter =
      current === 'create' && tutorialProgress.filter !== true;

    markInteraction();

    const finalize = () => {
      tutorialOpacity.setValue(0);
      setTutorialLayouts((prev) => ({ ...prev, [current]: null }));
      latestLayoutsRef.current[current] = null;
      setTutorialProgress((prev) => ({ ...prev, [current]: true }));
      setActiveTutorial(null);
      setPendingTutorial((prev) => prev ?? (queueFilter ? 'filter' : null));
      if (storageKey) {
        AsyncStorage.setItem(storageKey, 'true').catch((err) =>
          console.warn('Map tutorial write failed:', err?.message || err),
        );
      }
    };

    Animated.timing(tutorialOpacity, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      finalize();
    });
  }, [
    activeTutorial,
    tutorialKeys,
    tutorialProgress.filter,
    tutorialOpacity,
    markInteraction,
  ]);

  const tutorialHighlightStyle = useMemo(() => {
    if (!activeTutorial) return null;
    const layout = tutorialLayouts[activeTutorial];
    if (!layout) return null;
    const windowSize = Dimensions.get('window');

    if (activeTutorial === 'create') {
      const size = Math.max(layout.width, layout.height) + 36;
      const provisionalTop = layout.y + layout.height / 2 - size / 2;
      const provisionalLeft = layout.x + layout.width / 2 - size / 2;
      return {
        top: Math.max(Math.min(provisionalTop, windowSize.height - size), 0),
        left: Math.max(Math.min(provisionalLeft, windowSize.width - size), 0),
        width: size,
        height: size,
        borderRadius: size / 2,
      };
    }

    const padding = 14;
    const width = layout.width + padding * 2;
    const height = layout.height + padding * 2;
    const provisionalTop = layout.y - padding;
    const provisionalLeft = layout.x - padding;
    return {
      top: Math.max(Math.min(provisionalTop, windowSize.height - height), 0),
      left: Math.max(Math.min(provisionalLeft, windowSize.width - width), 0),
      width,
      height,
      borderRadius: 18,
    };
  }, [activeTutorial, tutorialLayouts]);

  const tutorialTooltipPosition = useMemo(() => {
    if (!activeTutorial) return null;
    const windowSize = Dimensions.get('window');
    const tooltipWidth = 280;
    const fallback = {
      top: Math.max(
        Math.min(windowSize.height * 0.4, windowSize.height - 220),
        16,
      ),
      left: Math.max(
        Math.min(
          (windowSize.width - tooltipWidth) / 2,
          windowSize.width - tooltipWidth - 16,
        ),
        16,
      ),
      width: tooltipWidth,
    };

    const layout = tutorialLayouts[activeTutorial];
    if (!layout) return fallback;

    if (activeTutorial === 'create') {
      const top = Math.max(layout.y - 170, 16);
      const left = Math.max(
        Math.min(
          layout.x + layout.width - tooltipWidth,
          windowSize.width - tooltipWidth - 16,
        ),
        16,
      );
      return { top, left, width: tooltipWidth };
    }

    const top = Math.min(
      layout.y + layout.height + 18,
      windowSize.height - 200,
    );
    const left = Math.max(
      Math.min(
        layout.x + layout.width - tooltipWidth,
        windowSize.width - tooltipWidth - 16,
      ),
      16,
    );
    return { top, left, width: tooltipWidth };
  }, [activeTutorial, tutorialLayouts]);

  const tutorialCopy = useMemo(() => {
    if (activeTutorial === 'create') {
      return {
        title: 'Create an event',
        description:
          'Tap the plus button to host your own meetup. Long-press the map first if you want to drop a pin before adding details.',
        cta: "Let's go",
      };
    }
    if (activeTutorial === 'filter') {
      return {
        title: 'Adjust your filters',
        description:
          'The map starts with events that match your interests. Open filters or try the date chips to explore more events.',
        cta: 'Got it',
      };
    }
    return null;
  }, [activeTutorial]);

  const openEventById = useCallback(
    async (eventId) => {
      if (!eventId) return;
      try {
        const eventRef = doc(db, 'events', eventId);
        const snap = await getDoc(eventRef);
        if (!snap.exists) {
          Alert.alert(
            'Event unavailable',
            'This event may no longer be available.',
          );
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setSelectedEvent(data);

        const lat = data?.location?.latitude;
        const lng = data?.location?.longitude;
        if (
          mapRef.current &&
          typeof lat === 'number' &&
          typeof lng === 'number'
        ) {
          mapRef.current.animateToRegion(
            {
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            },
            400,
          );
        }
      } catch (err) {
        console.warn(
          '[MapScreen] Failed to open event from deep link',
          err?.message || err,
        );
      }
    },
    [db],
  );

  useEffect(() => {
    const initialEventId = route?.params?.initialEventId;
    if (!initialEventId) return;
    openEventById(initialEventId);
    try {
      navigation?.setParams?.({ ...route.params, initialEventId: undefined });
    } catch {}
  }, [route?.params?.initialEventId, navigation, openEventById]);

  useEffect(() => {
    if (!userInterests.length) return;
    setSelectedFilters((prev) => {
      if (hasInitializedInterestsRef.current) return prev;
      if (Array.isArray(prev.interests) && prev.interests.length) {
        hasInitializedInterestsRef.current = true;
        return prev;
      }
      hasInitializedInterestsRef.current = true;
      return {
        ...prev,
        interests: [...userInterests],
      };
    });
  }, [userInterests]);

  // Description: SC-104 — Only check existing permission on mount, never request.
  // Location permission is requested contextually via the "Show Events Near Me" button.
  useEffect(() => {
    (async () => {
      try {
        // Only check existing permission status — do NOT request (Apple Guideline 5.1.5)
        let granted = false;
        try {
          const existing = await Location.getForegroundPermissionsAsync();
          granted = existing?.status === 'granted';
          setLocationPermission(existing?.status || 'undetermined');
        } catch {}

        // Description: Graceful degradation for Apple Guideline 5.1.5
        // Allow users to browse map even without location permission
        let gpsCoords = null;
        let fallbackCoords = null;

        if (granted) {
          const resolved = await resolveLocationWithFallback({
            canUseDevice: true,
            allowLastKnown: true,
            locationOptions: {
              accuracy: Location.Accuracy?.Balanced,
              maximumAge: 15_000,
              timeout: 15_000,
              mayShowUserSettingsDialog: true,
            },
          });
          gpsCoords = resolved?.coords || null;
        }

        const storedOverride = useDiscoveryLocationStore.getState().override;
        // Description: Check if user.location has valid coordinates (not null values)
        const userLocation =
          user?.location?.latitude != null && user?.location?.longitude != null
            ? user.location
            : null;
        fallbackCoords =
          gpsCoords || storedOverride?.coords || userLocation || null;

        // If no location available, use downtown Denver as default (initial launch city)
        if (!fallbackCoords) {
          fallbackCoords = {
            latitude: 39.7392,
            longitude: -104.9903,
          };
        }

        const overrideRegion = storedOverride?.coords
          ? buildRegionFromContext(
              storedOverride.coords,
              storedOverride.radiusMeters || DEFAULT_DISCOVERY_RADIUS_METERS,
            )
          : null;
        const initialRegion = overrideRegion || {
          ...fallbackCoords,
          latitudeDelta: 0.0922 * 1.5,
          longitudeDelta: 0.0421 * 1.5,
        };

        skipNextRegionSyncRef.current = true;
        setRegion(initialRegion);
        await fetchEventsInRegion(initialRegion, true);
        if (gpsCoords) {
          setGpsLocation({ coords: gpsCoords });
        }
      } catch (error) {
        console.error('Error loading map data:', error);
        // Description: Still allow map to load even if there's an error - use Denver default
        const defaultRegion = {
          latitude: 39.7392,
          longitude: -104.9903,
          latitudeDelta: 0.0922 * 1.5,
          longitudeDelta: 0.0421 * 1.5,
        };
        setRegion(defaultRegion);
        setInitialLoading(false);
      } finally {
        setInitialLoading(false);
      }
    })();
  }, []);

  const extractTimestamp = (value) => {
    if (!value) return null;
    if (typeof value === 'number') return value;
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    if (typeof value?.toDate === 'function') {
      try {
        return value.toDate().getTime();
      } catch {
        return null;
      }
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return null;
  };

  const getEventStartMs = (event) => {
    if (!event) return null;
    return (
      extractTimestamp(event.date) ??
      extractTimestamp(event.startAt) ??
      extractTimestamp(event.startDate) ??
      extractTimestamp(event.start)
    );
  };

  const getEventEndMs = (event) => {
    if (!event) return null;
    return (
      extractTimestamp(event.endAt) ??
      extractTimestamp(event.endDate) ??
      extractTimestamp(event.date) ??
      extractTimestamp(event.startAt)
    );
  };

  const boundaryMsForIsoDate = (isoDate, boundary = 'start') => {
    if (!isoDate || typeof isoDate !== 'string') return null;
    const [year, month, day] = isoDate.split('-').map(Number);
    if (!year || !month || !day) return null;
    const base = new Date(year, month - 1, day);
    if (boundary === 'end') {
      base.setHours(23, 59, 59, 999);
    } else {
      base.setHours(0, 0, 0, 0);
    }
    return base.getTime();
  };

  // Note: applyFilters is provided by useDiscoveryFeed hook

  const handleRegionChangeComplete = (newRegion) => {
    markInteraction();
    setRegion(newRegion);
    fetchEventsInRegion(newRegion);
    // Schedule previews after idle delay if cooldown allows
    schedulePreviews();
    if (skipNextRegionSyncRef.current) {
      skipNextRegionSyncRef.current = false;
      return;
    }
    syncDiscoveryLocationFromRegion(newRegion, 'pan');
  };

  // Hide previews while actively moving the map
  const handleRegionChange = () => {
    markInteraction();
    if (previewsIdleTimerRef.current) {
      clearTimeout(previewsIdleTimerRef.current);
      previewsIdleTimerRef.current = null;
    }
    if (previewItems.length) setPreviewItems([]);
  };

  // Simple utilities
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const isBoostedEvent = (event) => {
    if (!event) return false;
    if (typeof event.isBoosted === 'boolean') return event.isBoosted;
    if (typeof event.boosted === 'boolean') return event.boosted;
    if (typeof event.boostLevel === 'number') return event.boostLevel > 0;
    if (typeof event.priority === 'string')
      return event.priority.toLowerCase() === 'boosted';
    return false;
  };
  const getPopularityScore = (event) => {
    if (!event) return 0;
    if (typeof event.popularity === 'number') return event.popularity;
    if (typeof event.attendeesCount === 'number') return event.attendeesCount;
    if (Array.isArray(event.attendees)) return event.attendees.length;
    return 0;
  };
  const milesBetween = (a, b) => {
    if (!a || !b) return null;
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const d = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    const km = R * d;
    return km * 0.621371;
  };

  const schedulePreviews = useCallback(() => {
    if (!region || !filteredEvents?.length) return;
    const now = Date.now();
    if (now - previewsCooldownRef.current < PREVIEW_COOLDOWN_MS) return;
    if (previewsIdleTimerRef.current)
      clearTimeout(previewsIdleTimerRef.current);
    previewsIdleTimerRef.current = setTimeout(() => {
      buildPreviews();
    }, PREVIEW_IDLE_DELAY_MS);
  }, [region, filteredEvents]);

  // Re-schedule when event set changes meaningfully
  useEffect(() => {
    if (region) schedulePreviews();
  }, [filteredEvents, region, schedulePreviews]);

  const buildPreviews = useCallback(async () => {
    try {
      if (!mapRef.current || !region || !mapReady) return;

      // Compute visible subset in current region
      const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
      const latMin = latitude - latitudeDelta / 2;
      const latMax = latitude + latitudeDelta / 2;
      const lngMin = longitude - longitudeDelta / 2;
      const lngMax = longitude + longitudeDelta / 2;

      const candidates = filteredEvents
        .filter((e) => e?.location && !e.isDeleted)
        .filter((e) => {
          const { latitude: la, longitude: lo } = e.location;
          return la >= latMin && la <= latMax && lo >= lngMin && lo <= lngMax;
        });

      if (!candidates.length) {
        setPreviewItems([]);
        previewRotationRef.current = { signature: null, nextIndex: 0 };
        return;
      }

      const prioritized = candidates
        .map((event) => ({
          event,
          isBoosted: isBoostedEvent(event),
          popularity: getPopularityScore(event),
        }))
        .sort((a, b) => {
          if (a.isBoosted !== b.isBoosted) return a.isBoosted ? -1 : 1;
          if (b.popularity !== a.popularity) return b.popularity - a.popularity;
          const aId = a.event?.id || '';
          const bId = b.event?.id || '';
          return aId.localeCompare(bId);
        })
        .map((entry) => entry.event);

      const signature = prioritized.map((ev) => ev?.id || '').join('|');
      const rotationState = previewRotationRef.current;
      if (rotationState.signature !== signature) {
        rotationState.signature = signature;
        rotationState.nextIndex = 0;
      }

      const rotationOffset =
        prioritized.length > 1
          ? rotationState.nextIndex % prioritized.length
          : 0;

      const rotated =
        rotationOffset > 0
          ? [
              ...prioritized.slice(rotationOffset),
              ...prioritized.slice(0, rotationOffset),
            ]
          : prioritized;

      const anchors = [];
      const items = [];
      for (
        let i = 0;
        i < rotated.length && items.length < MAX_EVENT_PREVIEWS;
        i++
      ) {
        const ev = rotated[i];
        try {
          const pt = await mapRef.current.pointForCoordinate(ev.location);
          if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number')
            continue;
          const attendeeCount = Array.isArray(ev?.attendees)
            ? ev.attendees.length
            : typeof ev?.attendeesCount === 'number'
              ? ev.attendeesCount
              : 0;
          const badgeOffsetX = attendeeCount > 0 ? BADGE_ANCHOR_OFFSET : 0;
          const badgeOffsetY = attendeeCount > 0 ? BADGE_VERTICAL_OFFSET : 0;
          const anchorX = pt.x - badgeOffsetX;
          const anchorY = pt.y;

          const minTop = Math.max((insets?.top || 0) + PREVIEW_TOP_CHROME, 40);
          const minLeft = 8;
          const maxLeft = SCREEN_W - PREVIEW_WIDTH - 8;
          let left = clamp(anchorX - PREVIEW_WIDTH / 2, minLeft, maxLeft);
          let pointerX = anchorX - left;
          const bubbleMin = PREVIEW_BUBBLE_CENTER - PREVIEW_BUBBLE_WINDOW;
          const bubbleMax = PREVIEW_BUBBLE_CENTER + PREVIEW_BUBBLE_WINDOW;

          if (pointerX < bubbleMin) {
            const shift = Math.min(bubbleMin - pointerX, left - minLeft);
            if (shift > 0) {
              left -= shift;
              pointerX = anchorX - left;
            }
          } else if (pointerX > bubbleMax) {
            const shift = Math.min(pointerX - bubbleMax, maxLeft - left);
            if (shift > 0) {
              left += shift;
              pointerX = anchorX - left;
            }
          }

          const markerOffsetY = MARKER_VISUAL_OFFSET + badgeOffsetY;
          const idealTop =
            anchorY -
            (PREVIEW_HEIGHT + POINTER_MARGIN + POINTER_HEIGHT + markerOffsetY);
          const top = clamp(
            idealTop + PREVIEW_VERTICAL_GAP,
            minTop,
            SCREEN_H - PREVIEW_HEIGHT - 100,
          );
          const pointerXClamped = clamp(pointerX, 6, PREVIEW_WIDTH - 6);

          // avoid overlapping by anchor distance
          let ok = true;
          for (const a of anchors) {
            const dx = anchorX - a.x;
            const dy = anchorY - a.y;
            if (Math.sqrt(dx * dx + dy * dy) < MIN_ANCHOR_DIST) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;

          anchors.push({ x: anchorX, y: anchorY });
          const miles = milesBetween(
            { latitude, longitude },
            {
              latitude: ev.location.latitude,
              longitude: ev.location.longitude,
            },
          );
          const distanceText =
            typeof miles === 'number' ? `${miles.toFixed(1)} mi` : '';
          items.push({
            id: ev.id,
            event: ev,
            style: { position: 'absolute', width: PREVIEW_WIDTH, left, top },
            distanceText,
            pointerX: pointerXClamped,
          });
        } catch (e) {
          // skip failures
        }
      }

      setPreviewItems(items);
      if (rotated.length) {
        const advanceBy = Math.max(1, items.length);
        rotationState.nextIndex = (rotationOffset + advanceBy) % rotated.length;
      } else {
        rotationState.nextIndex = 0;
      }
      previewsCooldownRef.current = Date.now();
    } catch (e) {
      // ignore
    }
  }, [filteredEvents, region, mapReady, insets]);

  const handlePreviewPress = useCallback((ev) => {
    try {
      trackCardClick({
        card_type: 'preview',
        card_id: ev.id,
        surface: 'map',
        interest: ev?.interest,
        category: ev?.category,
      });
    } catch {}
    setSelectedEvent(ev);
  }, []);

  const handlePreviewJoin = useCallback(
    async (ev, helpers = {}) => {
      if (!ev) return null;

      let capturedMessage = null;

      try {
        const res = await joinEvent({
          event: ev,
          user,
          navigation,
          stores: { eventStore: eventStoreRef.current },
          options: {
            onShowMessage: (msg) => {
              if (typeof msg === 'string') {
                capturedMessage = msg;
                helpers.captureMessage?.(msg);
              }
            },
          },
        });

        if (res?.status === 'owner' || res?.status === 'already-attending') {
          navigation.navigate('EventChat', { eventId: ev.id });
          return { status: res.status };
        }

        if (res?.status === 'joined') {
          navigation.navigate('EventChat', { eventId: ev.id });
          return { status: 'joined' };
        }

        if (res?.status === 'requested') {
          helpers.onRequested?.();
          return {
            status: 'requested',
            message: "Request sent. We'll notify you once the host responds.",
            tone: 'success',
          };
        }

        if (res?.status === 'waitlisted') {
          return {
            status: 'waitlisted',
            message:
              capturedMessage ||
              'Added to the waitlist. We will reach out if a spot opens.',
            tone: 'info',
          };
        }

        const fallback = capturedMessage || res?.message;
        if (fallback) {
          return {
            status: res?.status || 'info',
            message: fallback,
            tone:
              res?.status === 'error' || res?.status === 'denied'
                ? 'error'
                : 'info',
          };
        }

        return { status: res?.status || 'unknown' };
      } catch (err) {
        console.error('[MapScreen] join failed:', err);
        return {
          status: 'error',
          message: err?.message || 'Join failed. Please try again.',
          tone: 'error',
        };
      }
    },
    [user, navigation],
  );

  const handleMapLongPress = async (e) => {
    markInteraction();
    const coordinate = e.nativeEvent.coordinate;
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coordinate.latitude},${coordinate.longitude}&key=${GOOGLE_MAPS_API_KEY}`,
      );
      const json = await res.json();
      const address = json.results?.[0]?.formatted_address || 'Unknown address';
      setNewEventLocation({ ...coordinate, address });
      setShowCreateModal(true);
    } catch {
      Alert.alert('Error', 'Failed to fetch address.');
    }
  };

  const onMarkerPress = useCallback(
    async (event) => {
      // Description: When a marker is pressed, enrich with host snippet via cache

      const ownerId = event?.ownerId || event?.ownerUID || event?.owner || null;

      if (!ownerId) {
        // Fallback: show event without host enrichment if no owner ID
        setSelectedEvent(event);
        return;
      }

      try {
        const map = await ensureSnippets([ownerId]);
        const host = map.get(ownerId);
        if (host) {
          // Attach host snippet for downstream UI components
          const enriched = {
            ...event,
            hostName: host.name || event.hostName,
            hostPhoto: host.photoURL || event.hostPhoto,
            hostRating: host.rating || event.hostRating,
          };
          setSelectedEvent(enriched);
        } else {
          // Fallback: directly fetch user data if snippet not found
          try {
            const userRef = doc(db, 'users', event.ownerId);
            const userSnapshot = await getDoc(userRef);
            setSelectedEvent({ ...event, user: userSnapshot.data() });
          } catch (error) {
            console.error('Error fetching user data:', error);
            // Still set the event even if user fetch fails
            setSelectedEvent(event);
          }
        }
      } catch (e) {
        console.error('Error ensuring snippets:', e);
        // Always set the event as fallback if snippet loading fails
        setSelectedEvent(event);
      }
    },
    [ensureSnippets],
  );

  const markerColors = useMemo(
    () =>
      theme.isDark
        ? {
            sponsored: '#C084FC',
            popular: '#FACC15',
            friend: '#38BDF8',
            visited: '#F97316',
            default: '#F87171',
          }
        : {
            sponsored: '#9B59B6',
            popular: '#F1C40F',
            friend: '#3498DB',
            visited: '#FF7F50',
            default: '#E74C3C',
          },
    [theme.isDark],
  );

  const getMarkerColor = useCallback(
    (event) => {
      if (event.isSponsored) return markerColors.sponsored;
      if (event.isPopular) return markerColors.popular;
      if (event.isFriendHosting) return markerColors.friend;
      if (event.isVisited) return markerColors.visited;
      return markerColors.default;
    },
    [markerColors],
  );

  const syncDiscoveryLocationFromRegion = useCallback(
    (region, source = 'pan', label = null) => {
      if (!region) return;
      setMapOverride({
        coords: {
          latitude: region.latitude,
          longitude: region.longitude,
        },
        radiusMeters: deriveRadiusFromRegion(region),
        label,
        source,
      });
    },
    [setMapOverride],
  );

  const handlePlaceSelect = (data, details) => {
    markInteraction();
    if (details?.geometry?.location) {
      const { lat, lng } = details.geometry.location;
      const newRegion = {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      skipNextRegionSyncRef.current = true;
      setRegion(newRegion);
      fetchEventsInRegion(newRegion);
      syncDiscoveryLocationFromRegion(
        newRegion,
        'search',
        data?.description || details?.formatted_address || null,
      );
      if (Platform.OS === 'android') setIsSearchFocused(false); // ✅ close overlay
    }
  };

  const handleToggleListView = () => {
    markInteraction();
    setShowListView((prev) => !prev);
  };

  // Description: SC-104 — Contextual location request with clear purpose string
  const requestLocationAndCenter = async () => {
    if (isLocating) return;
    markInteraction();
    setIsLocating(true);
    try {
      // Request permission (this triggers native iOS dialog with purpose string from Info.plist)
      const granted = await ensureForegroundPermission();
      setLocationPermission(granted ? 'granted' : 'denied');
      if (!granted) {
        Alert.alert(
          'Location Access Denied',
          'Showing all Denver events. Enable location in Settings to see nearby events.',
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () =>
                Platform.OS === 'ios'
                  ? Linking.openURL('app-settings:')
                  : Linking.openSettings?.(),
            },
          ],
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const userRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      skipNextRegionSyncRef.current = true;
      setRegion(userRegion);
      fetchEventsInRegion(userRegion);
      setGpsLocation({ coords: location.coords });
      clearOverride();
    } catch {
      Alert.alert('Error', 'Unable to get your location.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleCenterOnUser = () => requestLocationAndCenter();
  const handleShowEventsNearMe = () => requestLocationAndCenter();

  const formatDateForFilter = (dateObj) => {
    if (!(dateObj instanceof Date)) return null;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const buildRangeFromOffsets = (startOffset, endOffset) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() + startOffset);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + endOffset);

    return {
      start: formatDateForFilter(startDate),
      end: formatDateForFilter(endDate),
    };
  };

  const handleQuickDateChipPress = (chip) => {
    setSelectedFilters((prev) => {
      const isActive = prev.quickDatePreset === chip.key;
      if (isActive) {
        return {
          ...prev,
          quickDatePreset: null,
          dateRange: null,
        };
      }

      const nextRange = buildRangeFromOffsets(chip.startOffset, chip.endOffset);

      return {
        ...prev,
        quickDatePreset: chip.key,
        dateRange: nextRange,
      };
    });
  };

  const areFiltersEqual = (prev, next) => {
    if (prev === next) return true;
    if (!prev || !next) return false;
    if (prev.quickDatePreset !== next.quickDatePreset) return false;
    if (prev.genderOnly !== next.genderOnly) return false;
    if (prev.date !== next.date) return false;

    const prevRange = prev.dateRange || null;
    const nextRange = next.dateRange || null;
    if ((prevRange?.start || null) !== (nextRange?.start || null)) return false;
    if ((prevRange?.end || null) !== (nextRange?.end || null)) return false;

    const normalizeInterests = (list) =>
      Array.isArray(list)
        ? list
            .map((item) =>
              (typeof item === 'string' ? item : item?.name || item?.id || '')
                .toString()
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean)
            .sort()
        : [];

    const prevInterests = normalizeInterests(prev.interests);
    const nextInterests = normalizeInterests(next.interests);

    if (prevInterests.length !== nextInterests.length) return false;
    for (let i = 0; i < prevInterests.length; i += 1) {
      if (prevInterests[i] !== nextInterests[i]) return false;
    }

    return true;
  };

  const updateSelectedFilters = (filters = {}) => {
    setSelectedFilters((prev) => {
      const next = {
        ...prev,
        ...filters,
      };

      if (!Object.prototype.hasOwnProperty.call(filters, 'quickDatePreset')) {
        const sameRange =
          (prev?.dateRange?.start || null) ===
            (next.dateRange?.start || null) &&
          (prev?.dateRange?.end || null) === (next.dateRange?.end || null);
        next.quickDatePreset = sameRange ? prev.quickDatePreset : null;
      }

      if (areFiltersEqual(prev, next)) {
        return prev;
      }

      return next;
    });
  };

  // Don't block UI with loading spinner - let map render with skeleton/empty state
  // Background data loads will populate pins as they arrive

  // Check if user has interests selected
  if (userInterests.length === 0) {
    return (
      <View
        style={[
          { flex: 1, justifyContent: 'center', alignItems: 'center' },
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Text
          style={{
            fontSize: 16,
            textAlign: 'center',
            marginHorizontal: 20,
            color: theme.colors.text,
          }}
        >
          You must select some interests to view events.{'\n'}
          Please update your profile to get started.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {activeTutorial && tutorialCopy && (
        <Animated.View
          style={[styles.tutorialOverlay, { opacity: tutorialOpacity }]}
          pointerEvents='auto'
        >
          <View style={styles.tutorialBackdrop} />
          {tutorialHighlightStyle && (
            <View
              pointerEvents='none'
              style={[styles.tutorialHighlight, tutorialHighlightStyle]}
            />
          )}
          {tutorialTooltipPosition && (
            <View
              style={[styles.tutorialTooltip, tutorialTooltipPosition]}
              accessibilityLabel='Map tutorial tooltip'
            >
              <Text style={styles.tutorialTitle}>{tutorialCopy.title}</Text>
              <Text style={styles.tutorialDescription}>
                {tutorialCopy.description}
              </Text>
              <TouchableOpacity
                style={styles.tutorialButton}
                onPress={dismissActiveTutorial}
                accessibilityRole='button'
                accessibilityLabel='Dismiss map tutorial'
              >
                <Text style={styles.tutorialButtonText}>
                  {tutorialCopy.cta}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}
      {/* Search + Filter Bar */}
      <View
        style={[
          styles.searchBarUnified,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
        pointerEvents='box-none'
      >
        <View style={styles.searchIconContainer}>
          <Ionicons
            name='search'
            size={20}
            color={theme.colors.textSecondary}
          />
        </View>
        <GooglePlacesAutocomplete
          placeholder='Search places'
          predefinedPlaces={[]}
          minLength={2}
          fetchDetails={true}
          timeout={20000}
          textInputProps={{
            onFocus: () => {
              markInteraction();
              if (Platform.OS === 'android') setIsSearchFocused(true);
            },
            onBlur: () => {
              markInteraction();
              if (Platform.OS === 'android') setIsSearchFocused(false);
            },
            placeholderTextColor: theme.colors.textSecondary,
            style: styles.searchInputStyle,
            keyboardAppearance: themeMode === 'dark' ? 'dark' : 'light',
          }}
          onPress={(data, details = null) => handlePlaceSelect(data, details)}
          query={{
            key: GOOGLE_PLACES_API_KEY,
            language: 'en',
            types: 'geocode',
          }}
          keyboardShouldPersistTaps='handled'
          nestedScrollEnabled={true}
          enablePoweredByContainer={false}
          nearbyPlacesAPI='GooglePlacesSearch'
          debounce={200}
          styles={{
            container: styles.autocompleteContainer,
            textInputContainer: styles.autocompleteInputContainer,
            textInput: styles.autocompleteTextInput,
            listView: styles.autocompleteListView,
            row: styles.autocompleteRow,
            separator: styles.autocompleteSeparator,
            description: styles.autocompleteDescription,
            predefinedPlacesDescription:
              styles.autocompletePredefinedDescription,
          }}
        />
        <TouchableOpacity
          ref={filterButtonRef}
          onLayout={handleFilterButtonLayout}
          style={styles.filterButtonUnified}
          onPress={() => {
            markInteraction();
            setShowFilterWindow((prev) => !prev);
          }}
        >
          <Text style={styles.filterButtonTextUnified}>Filter</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        style={styles.quickDateChipScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickDateChipContainer}
      >
        {QUICK_DATE_FILTERS.map((chip) => {
          const isActive = selectedFilters.quickDatePreset === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[
                styles.quickDateChip,
                isActive && styles.quickDateChipActive,
              ]}
              onPress={() => handleQuickDateChipPress(chip)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.quickDateChipLabel,
                  isActive && styles.quickDateChipLabelActive,
                ]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ✅ ANDROID ONLY: Transparent overlay to block map touches */}
      {Platform.OS === 'android' && isSearchFocused && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'transparent',
            zIndex: 5,
          }}
          pointerEvents='none' // Changed from 'auto' to 'none' to fix touchability
        />
      )}

      {region && (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={
            Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT
          }
          region={region}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
          onLongPress={handleMapLongPress}
          onMapReady={() => setMapReady(true)}
          onLayout={() => setMapReady(true)}
          customMapStyle={mapAppearance.customStyle}
          userInterfaceStyle={
            Platform.OS === 'ios' ? mapAppearance.userInterfaceStyle : undefined
          }
          showsUserLocation={true}
          showsMyLocationButton={false}
        >
          {filteredEvents
            // Defensive: ensure marker has a valid location and isn't soft-deleted
            .filter((e) => {
              if (!e || e.isDeleted) return false;
              const loc = e?.location;
              const lat = loc?.latitude;
              const lng = loc?.longitude;
              return (
                loc &&
                typeof lat === 'number' &&
                !Number.isNaN(lat) &&
                typeof lng === 'number' &&
                !Number.isNaN(lng)
              );
            })
            .map((event) => {
              // Description: Check if event owner is a friend/following for blue border
              // Handle multiple possible owner field names
              const eventOwnerId =
                event?.ownerId || event?.ownerUID || event?.owner || null;

              // Description: Check both friends and following arrays since "friends" can be stored in following
              const userFriends = user?.friends || [];
              const userFollowing = user?.following || [];
              const isFriendEvent =
                eventOwnerId &&
                (userFriends.includes(eventOwnerId) ||
                  userFollowing.includes(eventOwnerId));

              const borderColor = isFriendEvent ? '#3B82F6' : '#fff';

              // Rendering CategoryMarker for event with category emoji
              return (
                <CategoryMarker
                  key={event.id}
                  event={event}
                  onPress={() => onMarkerPress(event)}
                  borderColor={borderColor}
                />
              );
            })}
          {newEventLocation && (
            <Marker coordinate={newEventLocation}>
              {renderCustomDotMarker(theme.colors.fabBackground)}
            </Marker>
          )}
        </MapView>
      )}

      {/* Floating Blip Previews */}
      {previewItems.length > 0 && (
        <View
          pointerEvents='box-none'
          style={[StyleSheet.absoluteFill, { zIndex: 50 }]}
        >
          {previewItems.map((p) => (
            <BlipPreview
              key={p.id}
              event={p.event}
              distanceText={p.distanceText}
              onPress={handlePreviewPress}
              onJoin={handlePreviewJoin}
              onRequest={handlePreviewJoin}
              style={[p.style, { zIndex: 20 }]}
              pointerX={p.pointerX}
              user={user}
            />
          ))}
        </View>
      )}

      {/* Description: SC-104 — Floating contextual location button when permission not yet granted */}
      {locationPermission !== 'granted' && (
        <TouchableOpacity
          style={styles.showNearMeButton}
          onPress={handleShowEventsNearMe}
          activeOpacity={0.85}
        >
          {isLocating ? (
            <ActivityIndicator
              size='small'
              color='#fff'
              style={{ marginRight: 8 }}
            />
          ) : (
            <Text style={styles.showNearMeEmoji}>📍</Text>
          )}
          <Text style={styles.showNearMeText}>Show Events Near Me</Text>
        </TouchableOpacity>
      )}

      {/* Left FABs */}
      <View style={styles.leftFabContainer}>
        <TouchableOpacity
          style={styles.listFab}
          onPress={handleToggleListView}
          activeOpacity={0.8}
        >
          <Ionicons name='list' size={28} color={theme.colors.neutral100} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.compassFab}
          onPress={handleCenterOnUser}
          activeOpacity={0.8}
        >
          {isLocating ? (
            <ActivityIndicator color={theme.colors.neutral100} />
          ) : (
            <Ionicons
              name='navigate'
              size={22}
              color={theme.colors.neutral100}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Create Event FAB */}
      <TouchableOpacity
        ref={createFabRef}
        onLayout={handleCreateFabLayout}
        style={styles.fab}
        onPress={() => {
          markInteraction();
          setShowCreateModal(true);
        }}
      >
        <Ionicons
          name='add'
          size={32}
          color={theme.colors.neutral100}
          style={styles.fabIcon}
        />
      </TouchableOpacity>

      {/* Event List Overlay */}
      {showListView && (
        <View style={styles.listViewOverlay}>
          <EventListView
            events={filteredEvents}
            onCloseListView={() => setShowListView(false)}
          />
        </View>
      )}

      {/* Create Event Modal */}
      <Modal
        visible={showCreateModal}
        animationType='slide'
        onRequestClose={() => setShowCreateModal(false)}
      >
        <CreateEventScreen
          location={newEventLocation}
          onCancel={() => {
            setShowCreateModal(false);
            setNewEventLocation(null);
          }}
          onSuccess={(loc) => {
            setShowCreateModal(false);
            setNewEventLocation(null);
            if (loc)
              setRegion({
                ...loc,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              });
          }}
          onOptimisticCreate={(event, tempId) => {
            // Description: Handle optimistic event creation
            if (!event) {
              // Remove failed optimistic event
              setOptimisticEvents((prev) =>
                prev.filter((e) => e.id !== tempId),
              );
              applyFilters(selectedFilters);
              return;
            }

            if (tempId && event.id !== tempId) {
              // Replace temp event with real event (has real Firestore ID)
              setOptimisticEvents((prev) => {
                const updated = prev.filter((e) => e.id !== tempId);
                // Only keep if not already in Firestore events
                if (!events.some((e) => e.id === event.id)) {
                  updated.push(event);
                }
                return updated;
              });
            } else {
              // Add new optimistic event
              setOptimisticEvents((prev) => [...prev, event]);
            }
            applyFilters(selectedFilters);
          }}
        />
      </Modal>

      {/* Filter Window */}
      {showFilterWindow && (
        <EventFilterWindow
          isVisible={showFilterWindow}
          onClose={() => setShowFilterWindow(false)}
          onApplyFilters={(filters) => {
            applyFilters(filters);
            setShowFilterWindow(false);
          }}
          selectedFilters={selectedFilters}
          currentUserGender={user.sex}
          userInterests={userInterests}
          updateSelectedFilters={updateSelectedFilters}
        />
      )}

      {/* Event PopUpCard - wrapped in native Modal so it overlays MapView */}
      {selectedEvent && (
        <Modal
          visible={true}
          transparent={true}
          animationType='slide'
          onRequestClose={() => setSelectedEvent(null)}
        >
          <View style={{ flex: 1 }} pointerEvents='box-none'>
            <EventPopUpCard
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              source='pin'
              surface='map'
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    tutorialOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
    },
    tutorialBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.overlay,
    },
    tutorialHighlight: {
      position: 'absolute',
      borderColor: theme.isDark
        ? 'rgba(255,255,255,0.65)'
        : 'rgba(37,99,235,0.35)',
      borderWidth: 2,
      backgroundColor: theme.isDark
        ? 'rgba(148,163,184,0.25)'
        : 'rgba(37,99,235,0.08)',
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.5 : 0.25,
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 16,
    },
    tutorialTooltip: {
      position: 'absolute',
      padding: 16,
      borderRadius: 12,
      backgroundColor: theme.colors.tooltipBackground,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.isDark ? 0.55 : 0.25,
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
      opacity: 0.9,
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
      color: theme.colors.chipTextActive,
      fontSize: 14,
      fontWeight: '600',
    },
    map: { flex: 1 },
    dot: {
      height: 18,
      width: 18,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: theme.colors.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dotLabel: {
      color: theme.colors.chipTextActive,
      fontSize: 11,
      fontWeight: '600',
    },
    fab: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.fabBackground,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 22,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.isDark ? 0.45 : 0.15,
      shadowRadius: theme.isDark ? 8 : 4,
      elevation: 3,
    },
    fabIcon: { textAlign: 'center', textAlignVertical: 'center' },
    leftFabContainer: {
      position: 'absolute',
      bottom: 20,
      left: 20,
      flexDirection: 'row',
      zIndex: 60,
    },
    listFab: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.fabBackground,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.isDark ? 0.45 : 0.15,
      shadowRadius: theme.isDark ? 8 : 4,
      elevation: 3,
    },
    compassFab: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.fabBackground,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.isDark ? 0.45 : 0.15,
      shadowRadius: theme.isDark ? 8 : 4,
      elevation: 3,
    },
    showNearMeButton: {
      position: 'absolute',
      bottom: 88,
      left: 20,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 24,
      zIndex: 61,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 5,
    },
    showNearMeEmoji: {
      fontSize: 16,
      marginRight: 8,
    },
    showNearMeText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    searchBarUnified: {
      position: 'absolute',
      top: 70,
      left: 10,
      right: 10,
      elevation: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderRadius: 15,
      height: 44,
      overflow: 'visible',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: theme.isDark ? 0.5 : 0.12,
      shadowRadius: theme.isDark ? 10 : 4,
      zIndex: 10,
    },
    searchIconContainer: {
      position: 'absolute',
      left: 12,
      zIndex: 1,
      width: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchInputStyle: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 16,
      height: 44,
      paddingVertical: 0,
      paddingLeft: 0,
      paddingRight: 0,
      margin: 0,
    },
    autocompleteContainer: {
      flex: 1,
      marginLeft: 40,
      marginRight: 8,
    },
    autocompleteInputContainer: {
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      borderBottomWidth: 0,
      paddingHorizontal: 0,
    },
    autocompleteTextInput: {
      height: 44,
      fontSize: 16,
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
      paddingVertical: 0,
      margin: 0,
      color: theme.colors.text,
    },
    autocompleteListView: {
      position: 'absolute',
      top: 48,
      left: -40,
      right: -8,
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.isDark ? 0.4 : 0.15,
      shadowRadius: 8,
      elevation: 8,
      maxHeight: 300,
      zIndex: 9999,
    },
    autocompleteRow: {
      backgroundColor: theme.colors.card,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 48,
      justifyContent: 'center',
    },
    autocompleteSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    autocompleteDescription: {
      color: theme.colors.text,
      fontSize: 15,
      lineHeight: 20,
    },
    autocompletePredefinedDescription: {
      color: theme.colors.textSecondary,
      fontSize: 14,
    },
    searchInputUnified: {
      flex: 1,
      backgroundColor: 'transparent',
      fontSize: 16,
      height: 44,
      paddingVertical: 0,
      color: theme.colors.text,
    },
    filterButtonUnified: {
      backgroundColor: theme.colors.primary,
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      minWidth: 70,
      borderTopRightRadius: 15,
      borderBottomRightRadius: 15,
    },
    filterButtonTextUnified: {
      color: theme.colors.chipTextActive,
      fontWeight: '600',
      fontSize: 15,
    },
    quickDateChipScroll: {
      position: 'absolute',
      top: 122,
      left: 10,
      right: 10,
      zIndex: 9,
    },
    quickDateChipContainer: {
      paddingVertical: 8,
      alignItems: 'center',
    },
    quickDateChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: theme.colors.chipBackground,
      marginRight: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: theme.isDark ? 0.35 : 0.15,
      shadowRadius: 3,
      elevation: 2,
    },
    quickDateChipActive: {
      backgroundColor: theme.colors.chipBackgroundActive,
      borderColor: theme.colors.primaryDark,
    },
    quickDateChipLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.chipText,
    },
    quickDateChipLabelActive: {
      color: theme.colors.chipTextActive,
    },
    eventPopUpContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100,
    },
    listViewOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 50,
      backgroundColor: 'transparent',
    },
  });
