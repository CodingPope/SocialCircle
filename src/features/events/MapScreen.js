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
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  where,
  doc,
  getDoc,
} from 'firebase/firestore';
import { useUserStore } from '../profile/userStore';
import { useUserSnippetStore } from '../profile/userSnippetStore';
import CreateEventScreen from './CreateEventScreen';
import { GOOGLE_MAPS_API_KEY } from '@env';
import EventListView from './EventListView';
import EventFilterWindow from './EventFilterWindow';
import EventPopUpCard from './EventPopUpCard';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { Ionicons } from '@expo/vector-icons';
// NEW: previews + markers
import BlipMarker from '../../components/map/BlipMarker';
import BlipPreview from '../../components/map/BlipPreview';
import { Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useEventStore } from './eventStore';
import joinEvent from './joinEvent';
import { trackCardClick, trackOpenEvent } from '../../lib/analytics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PREVIEW_WIDTH = Math.min(300, SCREEN_W - 16); // slightly narrower preview for smaller overall footprint
const PREVIEW_HEIGHT = 100; // reduced height estimate to position card a bit closer to the blip
const POINTER_HEIGHT = 10; // must match BlipPreview triangle height
const POINTER_MARGIN = 4; // distance between card and pointer
const MARKER_VISUAL_OFFSET = 20; // additional px to account for blip height so pointer apex lands on marker, not center
const PREVIEW_IDLE_DELAY_MS = 1000;
const PREVIEW_COOLDOWN_MS = 5000;
const MIN_ANCHOR_DIST = 110; // px separation between previews

const GOOGLE_PLACES_API_KEY = GOOGLE_MAPS_API_KEY;

const CustomDotMarker = ({ color, label, scale }) => (
  <View
    style={[styles.dot, { backgroundColor: color, transform: [{ scale }] }]}
  >
    {label ? <Text style={styles.dotLabel}>{label}</Text> : null}
  </View>
);

export default function MapScreen() {
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);

  if (!user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size='large' color='#007AFF' />
      </View>
    );
  }

  const userInterests = Array.isArray(user?.interests) ? user.interests : [];

  const db = getFirestore();

  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [newEventLocation, setNewEventLocation] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [region, setRegion] = useState(null);

  const [showListView, setShowListView] = useState(false);
  const [showFilterWindow, setShowFilterWindow] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  // NEW: previews state
  const [previewItems, setPreviewItems] = useState([]);
  const previewsIdleTimerRef = useRef(null);
  const previewsCooldownRef = useRef(0);
  const mapRef = useRef(null);
  const navigation = useNavigation();
  const eventStoreRef = useRef(useEventStore.getState());

  const [isLocating, setIsLocating] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [isSearchFocused, setIsSearchFocused] = useState(false); // ✅ TRACKS DROPDOWN STATE

  const [selectedFilters, setSelectedFilters] = useState({
    date: null,
    interests: [],
    genderOnly: false,
  });

  const unsubscribeRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission Denied',
            'Location permission is required to view events.'
          );
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        const initialRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.0922 * 1.5,
          longitudeDelta: 0.0421 * 1.5,
        };

        setRegion(initialRegion);
        await fetchEventsInRegion(initialRegion, true);
      } catch (error) {
        console.error('Error loading map data:', error);
      }
    })();
  }, []);

  useEffect(() => {
    if (
      events.length > 0 ||
      selectedFilters.interests.length > 0 ||
      selectedFilters.date ||
      selectedFilters.genderOnly
    ) {
      applyFilters(selectedFilters);
    }
  }, [events, selectedFilters]);

  const applyFilters = (filters) => {
    setSelectedFilters(filters);
    const { date, interests, genderOnly } = filters;
    let filtered = [...events];
    if (!events.length) return;

    const now = Date.now();
    filtered = filtered.filter((event) => {
      let eventTime = null;
      if (event.endAt) {
        eventTime = event.endAt.toDate
          ? event.endAt.toDate().getTime()
          : event.endAt.seconds * 1000;
      } else if (event.date) {
        if (event.date.toDate) eventTime = event.date.toDate().getTime();
        else if (event.date.seconds) eventTime = event.date.seconds * 1000;
        else if (event.date instanceof Date) eventTime = event.date.getTime();
      }
      return eventTime && eventTime + 60 * 60 * 1000 > now;
    });

    // Date filter: compare by UTC date string (YYYY-MM-DD) to match picker formatting
    if (date) {
      filtered = filtered.filter((e) => {
        let startMs = null;
        const d = e?.date;
        if (d?.toDate) startMs = d.toDate().getTime();
        else if (typeof d?.seconds === 'number') startMs = d.seconds * 1000;
        else if (d instanceof Date) startMs = d.getTime();
        else if (typeof d === 'string') {
          const parsed = Date.parse(d);
          if (!isNaN(parsed)) startMs = parsed;
        }
        if (!startMs) return false;
        const evDateStr = new Date(startMs).toISOString().split('T')[0];
        return evDateStr === date;
      });
    }

    // Fix: interests from filter are strings (names). Events store `interest` as a string.
    if (Array.isArray(interests) && interests.length > 0) {
      const interestSet = new Set(
        interests
          .map((i) =>
            (typeof i === 'string' ? i : i?.name || i?.id || '')
              .toString()
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      );
      filtered = filtered.filter((e) => {
        const evInterest = (
          typeof e.interest === 'string'
            ? e.interest
            : e.interest?.name || e.category || ''
        )
          .toString()
          .trim()
          .toLowerCase();
        return evInterest && interestSet.has(evInterest);
      });
    }

    if (genderOnly) {
      filtered = filtered.filter((e) => e.privacy === genderOnly);
    }
    if (userInterests.length === 0) {
      return (
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text>You must select some interests to view events.</Text>
        </View>
      );
    }
    setFilteredEvents(filtered);
  };

  const fetchEventsInRegion = async (region, isInitial = false) => {
    if (!region) return;
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

    const multiplier = 1.5;
    const latMin = latitude - (latitudeDelta * multiplier) / 2;
    const latMax = latitude + (latitudeDelta * multiplier) / 2;
    const lngMin = longitude - (longitudeDelta * multiplier) / 2;
    const lngMax = longitude + (longitudeDelta * multiplier) / 2;

    if (unsubscribeRef.current) unsubscribeRef.current();
    const q = query(
      collection(db, 'events'),
      where('location.latitude', '>=', latMin),
      where('location.latitude', '<=', latMax),
      where('location.longitude', '>=', lngMin),
      where('location.longitude', '<=', lngMax),
      // Server-side: exclude soft-deleted events
      where('isDeleted', '==', false)
    );

    return new Promise((resolve) => {
      unsubscribeRef.current = onSnapshot(
        q,
        (snap) => {
          const nowMs = Date.now();
          const regionEvents = snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            // exclude soft-deleted
            .filter((e) => e.isDeleted !== true)
            // exclude expired (date + 1h)
            .filter((event) => {
              let eventTime = null;
              if (event.endAt) {
                if (event.endAt.toDate)
                  eventTime = event.endAt.toDate().getTime();
                else if (event.endAt.seconds)
                  eventTime = event.endAt.seconds * 1000;
              } else if (event.date) {
                if (event.date.toDate)
                  eventTime = event.date.toDate().getTime();
                else if (event.date.seconds)
                  eventTime = event.date.seconds * 1000;
                else if (event.date instanceof Date)
                  eventTime = event.date.getTime();
              }
              return eventTime && eventTime + 60 * 60 * 1000 > nowMs;
            });
          setEvents(regionEvents);
          applyFilters(selectedFilters);

          if (isInitial) {
            setInitialLoading(false);
          }
          resolve();
        },
        (error) => {
          if (error?.code === 'permission-denied') {
            setEvents([]);
            try {
              unsubscribeRef.current && unsubscribeRef.current();
            } catch {}
            // also register global once for logout cleanup
            try {
              if (!global.unsubscribeAllListeners)
                global.unsubscribeAllListeners = [];
              if (unsubscribeRef.current)
                global.unsubscribeAllListeners.push(unsubscribeRef.current);
            } catch {}
            if (isInitial) setInitialLoading(false);
            resolve();
            return;
          }
          console.error('Map events listener error:', error);
          if (isInitial) setInitialLoading(false);
          resolve();
        }
      );
      // Track globally for general case
      try {
        if (!global.unsubscribeAllListeners)
          global.unsubscribeAllListeners = [];
        if (unsubscribeRef.current)
          global.unsubscribeAllListeners.push(unsubscribeRef.current);
      } catch {}
    });
  };

  const handleRegionChangeComplete = (newRegion) => {
    setRegion(newRegion);
    fetchEventsInRegion(newRegion);
    // Schedule previews after idle delay if cooldown allows
    schedulePreviews();
  };

  // Hide previews while actively moving the map
  const handleRegionChange = () => {
    if (previewsIdleTimerRef.current) {
      clearTimeout(previewsIdleTimerRef.current);
      previewsIdleTimerRef.current = null;
    }
    if (previewItems.length) setPreviewItems([]);
  };

  // Simple utilities
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
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
      if (!mapRef.current || !region) return;

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
        return;
      }

      const shuffled = shuffle(candidates);
      const anchors = [];
      const items = [];
      for (let i = 0; i < shuffled.length && items.length < 3; i++) {
        const ev = shuffled[i];
        try {
          const pt = await mapRef.current.pointForCoordinate(ev.location);
          if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number')
            continue;
          // keep off-screen margins and avoid under search bar area
          const minTop = 70 + 44 + 8; // search bar top + height + spacing
          const left = clamp(
            pt.x - PREVIEW_WIDTH / 2,
            8,
            SCREEN_W - PREVIEW_WIDTH - 8
          );
          // Place card so that pointer apex lands on top of the blip (account for marker visual height)
          const idealTop =
            pt.y -
            (PREVIEW_HEIGHT +
              POINTER_MARGIN +
              POINTER_HEIGHT +
              MARKER_VISUAL_OFFSET);
          const top = clamp(idealTop, minTop, SCREEN_H - PREVIEW_HEIGHT - 100);

          // avoid overlapping by anchor distance
          let ok = true;
          for (const a of anchors) {
            const dx = pt.x - a.x;
            const dy = pt.y - a.y;
            if (Math.sqrt(dx * dx + dy * dy) < MIN_ANCHOR_DIST) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;

          anchors.push({ x: pt.x, y: pt.y });
          const miles = milesBetween(
            { latitude, longitude },
            { latitude: ev.location.latitude, longitude: ev.location.longitude }
          );
          const distanceText =
            typeof miles === 'number' ? `${miles.toFixed(1)} mi` : '';
          const pointerX = clamp(pt.x - left, 6, PREVIEW_WIDTH - 6); // pointer offset inside card
          items.push({
            id: ev.id,
            event: ev,
            style: { position: 'absolute', width: PREVIEW_WIDTH, left, top },
            distanceText,
            pointerX,
          });
        } catch (e) {
          // skip failures
        }
      }

      setPreviewItems(items);
      previewsCooldownRef.current = Date.now();
    } catch (e) {
      // ignore
    }
  }, [filteredEvents, region]);

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
    async (ev) => {
      if (!ev) return;
      const onShowMessage = (msg) => msg && Alert.alert('Info', msg);
      const res = await joinEvent({
        event: ev,
        user,
        navigation,
        stores: { eventStore: eventStoreRef.current },
        options: { onShowMessage },
      });

      // If member, route to chat immediately
      if (res?.status === 'owner' || res?.status === 'already-attending') {
        navigation.navigate('EventChat', { eventId: ev.id });
      }
    },
    [user, navigation]
  );

  const handleMapLongPress = async (e) => {
    const coordinate = e.nativeEvent.coordinate;
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coordinate.latitude},${coordinate.longitude}&key=${GOOGLE_MAPS_API_KEY}`
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
      if (!ownerId) return;
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
          }
        }
      } catch (e) {
        console.error('Error ensuring snippets:', e);
      }
    },
    [ensureSnippets]
  );

  const getMarkerColor = (event) => {
    if (event.isSponsored) return '#9B59B6';
    if (event.isPopular) return '#F1C40F';
    if (event.isFriendHosting) return '#3498DB';
    if (event.isVisited) return '#FF7F50';
    return '#E74C3C';
  };

  const handlePlaceSelect = (data, details) => {
    if (details?.geometry?.location) {
      const { lat, lng } = details.geometry.location;
      const newRegion = {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      setRegion(newRegion);
      fetchEventsInRegion(newRegion);
      if (Platform.OS === 'android') setIsSearchFocused(false); // ✅ close overlay
    }
  };

  const handleToggleListView = () => setShowListView((prev) => !prev);

  const handleCenterOnUser = async () => {
    setIsLocating(true);
    try {
      const location = await Location.getCurrentPositionAsync({});
      const userRegion = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      setRegion(userRegion);
      fetchEventsInRegion(userRegion);
    } catch {
      Alert.alert('Error', 'Unable to get your location.');
    }
    setIsLocating(false);
  };

  const updateSelectedFilters = (filters) => {
    setSelectedFilters(filters);
  };

  if (initialLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size='large' color='#007AFF' />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search + Filter Bar */}
      <View style={styles.searchBarUnified} pointerEvents='box-none'>
        <Ionicons
          name='search'
          size={18}
          color='#A0A0A0'
          style={{ marginLeft: 10, marginRight: 6 }}
        />
        <GooglePlacesAutocomplete
          placeholder='Search places'
          predefinedPlaces={[]}
          minLength={2}
          fetchDetails={true}
          textInputProps={{
            onFocus: () =>
              Platform.OS === 'android' && setIsSearchFocused(true),
            onBlur: () =>
              Platform.OS === 'android' && setIsSearchFocused(false),
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
            container: {
              flex: 1,
            },
            textInput: {
              height: 44,
              fontSize: 16,
              backgroundColor: 'transparent',
              paddingHorizontal: 0,
            },
            listView: {
              position: 'absolute',
              top: 44,
              left: 0,
              right: 0,
              backgroundColor: '#fff',
              zIndex: 9999,
              elevation: 9999,
            },
          }}
        />
        <TouchableOpacity
          style={styles.filterButtonUnified}
          onPress={() => setShowFilterWindow((prev) => !prev)}
        >
          <Text style={styles.filterButtonTextUnified}>Filter</Text>
        </TouchableOpacity>
      </View>

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
          region={region}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
          onLongPress={handleMapLongPress}
        >
          {filteredEvents
            // Defensive: ensure marker has a valid location and isn't soft-deleted
            .filter((e) => e && e.location && !e.isDeleted)
            .map((event) => (
              <BlipMarker
                key={event.id}
                event={event}
                onPress={onMarkerPress}
              />
            ))}
          {newEventLocation && (
            <Marker coordinate={newEventLocation}>
              <CustomDotMarker color='#007AFF' scale={1} />
            </Marker>
          )}
        </MapView>
      )}

      {/* Floating Blip Previews */}
      {previewItems?.length > 0 && (
        <View pointerEvents='box-none' style={StyleSheet.absoluteFill}>
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

      {/* Left FABs */}
      <View style={styles.leftFabContainer}>
        <TouchableOpacity
          style={styles.listFab}
          onPress={handleToggleListView}
          activeOpacity={0.8}
        >
          <Ionicons name='list' size={28} color='#fff' />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.compassFab}
          onPress={handleCenterOnUser}
          activeOpacity={0.8}
        >
          {isLocating ? (
            <ActivityIndicator color='#fff' />
          ) : (
            <Ionicons name='navigate' size={22} color='#fff' />
          )}
        </TouchableOpacity>
      </View>

      {/* Create Event FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name='add' size={32} color='#fff' style={styles.fabIcon} />
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

      {/* Event PopUpCard */}
      {selectedEvent && (
        <EventPopUpCard
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          source='pin'
          surface='map'
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, zIndex: 1 },
  dot: {
    height: 18,
    width: 18,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 22,
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
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  compassFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  searchBarUnified: {
    position: 'absolute',
    top: 70,
    left: 10,
    right: 10,
    elevation: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 15,
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 10,
  },
  searchInputUnified: {
    flex: 1,
    backgroundColor: 'transparent',
    fontSize: 16,
    height: 44,
    paddingVertical: 0,
  },
  filterButtonUnified: {
    backgroundColor: '#007AFF',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 15,
  },
  filterButtonTextUnified: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
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
