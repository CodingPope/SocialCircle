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
import { Ionicons } from '@expo/vector-icons';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { MaterialIcons } from '@expo/vector-icons'; // Add this import

const GOOGLE_PLACES_API_KEY = GOOGLE_MAPS_API_KEY;
const allCategories = [
  'Hiking',
  'Surf boarding',
  'Volleyball',
  'Bar hopping',
  'Coffee',
  'Dog walk',
  'Run',
  'Picnic',
  'Game night',
  'Board games',
  'Book club',
  'Workshop',
  'Networking',
  'Yoga',
  'Cooking class',
  'Movie night',
  'Live music',
  'Art exhibit',
  'Photography walk',
];

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
    const { date, interests } = filters;
    let filtered = [...events];
    if (date) filtered = filtered.filter((event) => event.date === date);
    if (interests.length > 0)
      filtered = filtered.filter((event) => interests.includes(event.category));
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
      setFilteredEvents(regionEvents);
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
      <TouchableOpacity
        style={styles.listFab}
        onPress={handleToggleListView}
        activeOpacity={0.8}
      >
        <MaterialIcons name='list' size={28} color='#fff' />
      </TouchableOpacity>

      {/* Floating Action Button (bottom right) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
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
  fabIcon: { color: '#fff', fontSize: 32 },
  listFab: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60, // Above map, below EventListView
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
