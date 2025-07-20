// src/screens/Main/MapScreen.js

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
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
import { Ionicons } from '@expo/vector-icons'; // Add this import

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
  const db = getFirestore();

  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [newEventLocation, setNewEventLocation] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [region, setRegion] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [showListView, setShowListView] = useState(false);
  const [showFilterWindow, setShowFilterWindow] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedFilters, setSelectedFilters] = useState({
    date: null,
    interests: [],
  });

  const [isLocating, setIsLocating] = useState(false);

  const unsubscribeRef = useRef(null);
  const searchInputRef = useRef(null);

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
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
      setRegion(initialRegion);
      fetchEventsInRegion(initialRegion);
    })();
  }, []);

  const applyFilters = (filters) => {
    setSelectedFilters(filters);
    const { date, interests, genderOnly } = filters;
    let filtered = [...events];

    // --- Remove expired events (date + 1 hour) ---
    const now = Date.now();
    filtered = filtered.filter((event) => {
      let eventTime = null;
      if (event.endAt) {
        if (event.endAt.toDate) eventTime = event.endAt.toDate().getTime();
        else if (event.endAt.seconds) eventTime = event.endAt.seconds * 1000;
      } else if (event.date) {
        if (event.date.toDate) eventTime = event.date.toDate().getTime();
        else if (event.date.seconds) eventTime = event.date.seconds * 1000;
        else if (event.date instanceof Date) eventTime = event.date.getTime();
      }
      // Remove if eventTime is not set or is more than 1 hour ago
      return eventTime && eventTime + 60 * 60 * 1000 > now;
    });

    if (date) filtered = filtered.filter((event) => event.date === date);
    if (interests && interests.length > 0)
      filtered = filtered.filter((event) => interests.includes(event.category));
    // Description: Filter events by privacy if genderOnly is set
    if (genderOnly) {
      filtered = filtered.filter(
        (event) => event.privacy === genderOnly // Only show events with privacy set to user's gender
      );
    }
    setFilteredEvents(filtered);
  };

  const fetchEventsInRegion = (region) => {
    if (!region) return;
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    const latMin = latitude - latitudeDelta / 2;
    const latMax = latitude + latitudeDelta / 2;
    const lngMin = longitude - longitudeDelta / 2;
    const lngMax = longitude + longitudeDelta / 2;
    if (unsubscribeRef.current) unsubscribeRef.current();
    const q = query(
      collection(db, 'events'),
      where('location.latitude', '>=', latMin),
      where('location.latitude', '<=', latMax),
      where('location.longitude', '>=', lngMin),
      where('location.longitude', '<=', lngMax)
    );
    unsubscribeRef.current = onSnapshot(q, (snap) => {
      const regionEvents = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setEvents(regionEvents);
      // Description: Always re-apply filters after fetching events
      applyFilters(selectedFilters);
    });
  };

  const handleRegionChangeComplete = (newRegion) => {
    setRegion(newRegion);
    fetchEventsInRegion(newRegion);
  };

  const handleMapLongPress = async (e) => {
    const coordinate = e.nativeEvent.coordinate;
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coordinate.latitude},${coordinate.longitude}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const json = await response.json();
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

  // --- Search Autocomplete Handler ---
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
    }
  };

  // --- Add handler for list view toggle ---
  const handleToggleListView = () => setShowListView((prev) => !prev);

  // Handler to center map on user's current location
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
    } catch (err) {
      Alert.alert('Error', 'Unable to get your location.');
    }
    setIsLocating(false);
  };

  return (
    <View style={styles.container}>
      {/* Always show search bar at the top */}
      <View style={styles.searchBarContainer}>
        <GooglePlacesAutocomplete
          placeholder='Search places'
          minLength={2}
          fetchDetails={true}
          onPress={handlePlaceSelect}
          query={{
            key: GOOGLE_PLACES_API_KEY,
            language: 'en',
          }}
          styles={{
            textInput: styles.searchInput,
            container: { flex: 1 },
            listView: { backgroundColor: '#fff', zIndex: 2 },
          }}
          enablePoweredByContainer={false}
          debounce={300}
        />
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilterWindow((prev) => !prev)}
        >
          <Text style={styles.filterButtonText}>Filter</Text>
        </TouchableOpacity>
      </View>

      {region && (
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={handleRegionChangeComplete}
          onMapReady={() => fetchEventsInRegion(region)}
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

      {/* Floating List Button (bottom left) */}
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

      {/* Floating Action Button (bottom right) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name='add' size={32} color='#fff' style={styles.fabIcon} />
      </TouchableOpacity>

      {/* Event List View as overlay modal */}
      {showListView && (
        <View style={styles.listViewOverlay}>
          <EventListView
            events={filteredEvents}
            onCloseListView={() => setShowListView(false)}
          />
        </View>
      )}

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
              setRegion({ ...loc, latitudeDelta: 0.05, longitudeDelta: 0.05 });
          }}
        />
      </Modal>

      {showFilterWindow && (
        <EventFilterWindow
          isVisible={showFilterWindow}
          onClose={() => setShowFilterWindow(false)}
          onApplyFilters={(filters) => {
            applyFilters(filters);
            setShowFilterWindow(false);
          }}
          selectedFilters={selectedFilters}
          currentUserGender={user.sex} // e.g., "male" or "female"
        />
      )}

      {/* Overlay: EventPopUpCard (always highest zIndex except modals) */}
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
  map: { flex: 1 },
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
    zIndex: 22, // Ensure above map
  },
  fabIcon: {
    // Description: Center icon in FAB
    textAlign: 'center',
    textAlignVertical: 'center',
  },
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
  searchBarContainer: {
    position: 'absolute',
    top: 60,
    left: 10,
    right: 80,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    zIndex: 1,
  },
  searchInput: { flex: 1, height: 40 },
  filterButton: {
    position: 'absolute',
    right: -70,
    height: 40,
    width: 70,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonText: { color: '#fff', fontWeight: 'bold' },
  eventPopUpContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100, // Highest overlay except modals
  },
  listViewOverlay: {
    // Description: Full-screen overlay for EventListView, above all UI except EventFilterWindow
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50, // Lower than EventFilterWindow (which should be 100+)
    backgroundColor: 'transparent',
  },
});
