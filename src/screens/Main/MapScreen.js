import React, { useState, useEffect, useRef } from 'react';
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
import { useAuth } from '../../context/AuthContext';
import CreateEventScreen from './CreateEventScreen';
import { GOOGLE_MAPS_API_KEY } from '@env';
import EventListView from '../../components/EventListView';
import EventFilterWindow from '../../components/EventFilterWindow';
import EventPopUpCard from '../../components/EventPopUpCard';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { Ionicons } from '@expo/vector-icons';

const GOOGLE_PLACES_API_KEY = GOOGLE_MAPS_API_KEY;

const CustomDotMarker = ({ color, label, scale }) => (
  <View
    style={[styles.dot, { backgroundColor: color, transform: [{ scale }] }]}
  >
    {label ? <Text style={styles.dotLabel}>{label}</Text> : null}
  </View>
);

export default function MapScreen() {
  const { user } = useAuth();

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
  const [selectedFilters, setSelectedFilters] = useState({
    date: null,
    interests: [],
  });

  const [isLocating, setIsLocating] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [isSearchFocused, setIsSearchFocused] = useState(false); // ✅ TRACKS DROPDOWN STATE

  const unsubscribeRef = useRef(null);

  useEffect(() => {
    (async () => {
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
      setSelectedFilters((prev) => ({
        ...prev,
        interests: userInterests,
      }));

      await fetchEventsInRegion(initialRegion, true);
    })();
  }, [userInterests]);

  const applyFilters = (filters) => {
    setSelectedFilters(filters);
    const { date, interests, genderOnly } = filters;
    let filtered = [...events];

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

    if (date) filtered = filtered.filter((e) => e.date === date);
    if (interests?.length > 0) {
      const interestIds = interests.map((i) => i.id);
      filtered = filtered.filter((e) => interestIds.includes(e.category));
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
      where('location.longitude', '<=', lngMax)
    );

    return new Promise((resolve) => {
      unsubscribeRef.current = onSnapshot(q, (snap) => {
        const regionEvents = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setEvents(regionEvents);
        applyFilters(selectedFilters);

        if (isInitial) {
          setInitialLoading(false);
        }
        resolve();
      });
    });
  };

  const handleRegionChangeComplete = (newRegion) => {
    setRegion(newRegion);
    fetchEventsInRegion(newRegion);
  };

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

  const handleMarkerPress = async (event) => {
    try {
      const userRef = doc(db, 'users', event.ownerId);
      const userSnapshot = await getDoc(userRef);
      setSelectedEvent({ ...event, user: userSnapshot.data() });
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

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
          pointerEvents='auto'
        />
      )}

      {region && (
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={handleRegionChangeComplete}
          onLongPress={handleMapLongPress}
        >
          {filteredEvents.map((event) => (
            <Marker
              key={event.id}
              coordinate={event.location}
              onPress={() => handleMarkerPress(event)}
            >
              <CustomDotMarker
                color={getMarkerColor(event)}
                label={event.attendeeCount?.toString()}
                scale={1}
              />
            </Marker>
          ))}
          {newEventLocation && (
            <Marker coordinate={newEventLocation}>
              <CustomDotMarker color='#007AFF' scale={1} />
            </Marker>
          )}
        </MapView>
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
        <View style={styles.eventPopUpContainer}>
          <EventPopUpCard
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        </View>
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
    top: 50,
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
