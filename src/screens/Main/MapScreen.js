// src/screens/Main/MapScreen.js

import React, { useState, useEffect } from 'react';
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
  getDocs,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import CreateEventScreen from './CreateEventScreen';
import { GOOGLE_MAPS_API_KEY } from '@env';
import EventListView from '../../components/EventListView';
import EventFilterWindow from '../../components/EventFilterWindow';
import EventPopUpCard from '../../components/EventPopUpCard';
import { Ionicons } from '@expo/vector-icons';

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
  useEffect(() => {
    if (user && user.interests && user.interests.length > 0) {
      setSelectedCategory('all'); // or set to user's interests array if you support multi-select
    } else {
      setSelectedCategory('all');
    }
  }, [user]);
  const db = getFirestore();

  const [events, setEvents] = useState([]);
  const [newEventLocation, setNewEventLocation] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [region, setRegion] = useState(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(true);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Filter state (simple example: filter by category)
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // List view state
  const [showListView, setShowListView] = useState(false);
  const [showFilterWindow, setShowFilterWindow] = useState(false);

  // Event pop-up state
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activePopUp, setActivePopUp] = useState(null); // Track active pop-up

  // Fetch events with optional category filter, respecting Firestore indexes
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to view events on the map.'
        );
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      setRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      });
    })();
  }, []);

  // Always fetch all active events, then filter in JS
  useEffect(() => {
    if (!user) {
      console.error('User is not authenticated. Cannot fetch events.');
      return;
    }

    const q = query(collection(db, 'events'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const evs = [];
        snap.forEach((doc) => evs.push({ id: doc.id, ...doc.data() }));
        console.log('Fetched events:', evs);
        setEvents(evs);
      },
      (error) => {
        console.error('Error fetching events:', error);
        if (error.code === 'permission-denied') {
          Alert.alert(
            'Permission Denied',
            'You do not have permission to access events. Please check your Firestore rules.'
          );
        }
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Filter events by selected category in JS
  const filteredEvents =
    selectedCategory && selectedCategory !== 'all'
      ? events.filter((ev) => {
          const match = ev.category === selectedCategory;
          if (match) {
            console.log('Event matches filter:', ev);
          }
          return match;
        })
      : events;

  const handleMapLongPress = (e) => {
    setNewEventLocation(e.nativeEvent.coordinate);
    setShowCreateModal(true);
  };

  // When user selects a place from search results
  const handlePlaceSelect = async (place) => {
    setShowSearchResults(false);
    setSearchQuery('');
    setSearchResults([]);

    // Get place details to get lat/lng
    try {
      setSearchLoading(true);
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&key=${GOOGLE_PLACES_API_KEY}`
      );
      const json = await response.json();
      if (json.status === 'OK') {
        const location = json.result.geometry.location;
        const coordinate = {
          latitude: location.lat,
          longitude: location.lng,
        };
        setRegion({
          ...coordinate,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
        setNewEventLocation(coordinate);
        setShowCreateModal(true);
      } else {
        alert('Failed to get place details');
      }
    } catch (error) {
      console.error(error);
      alert('Error fetching place details');
    } finally {
      setSearchLoading(false);
    }
  };

  // Search places autocomplete
  const handleSearchChange = async (text) => {
    setSearchQuery(text);
    if (text.length < 3) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          text
        )}&key=${GOOGLE_PLACES_API_KEY}&types=geocode`
      );
      const json = await response.json();
      if (json.status === 'OK') {
        setSearchResults(json.predictions);
        setShowSearchResults(true);
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    } catch (error) {
      console.error(error);
      setSearchResults([]);
      setShowSearchResults(false);
    } finally {
      setSearchLoading(false);
    }
  };

  // When user presses the FAB, open the search bar (if hidden) or focus it
  const searchInputRef = React.useRef(null);

  const handleFabPress = () => {
    setNewEventLocation(null); // No location yet, user will enter manually
    setShowCreateModal(true);
    // Show the search bar and focus input for address entry
    setShowSearchBar(true);
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 100);
  };

  const toggleListView = () => setShowListView((prev) => !prev);
  const toggleFilterWindow = () => setShowFilterWindow((prev) => !prev);

  const applyFilters = (filters) => {
    console.log('Filters applied:', filters);
    // Implement filtering logic here
    const { date, interests } = filters;
    let filtered = events;

    if (date) {
      filtered = filtered.filter((event) => event.date === date);
    }

    if (interests && interests.length > 0) {
      filtered = filtered.filter((event) =>
        interests.some((interest) => event.category === interest)
      );
    }

    setEvents(filtered);
  };

  // Updated Marker interaction to fetch user information and pass it to EventPopUp
  const handleMarkerPress = async (event) => {
    try {
      console.log('Marker clicked:', event);
      const userRef = doc(getFirestore(), 'users', event.ownerId);
      const userSnapshot = await getDoc(userRef);
      const userData = userSnapshot.exists() ? userSnapshot.data() : null;
      setSelectedEvent({ ...event, user: userData });
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  // Compute marker scale based on zoom: baseDelta is the initial latitudeDelta
  const baseDelta = 0.0922;
  const markerScale = region
    ? Math.min(Math.max(baseDelta / region.latitudeDelta, 0.8), 2)
    : 1;

  // Function to fetch events within the visible map region
  const fetchEventsInRegion = async (region) => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

    // Calculate bounds
    const latMin = latitude - latitudeDelta / 2;
    const latMax = latitude + latitudeDelta / 2;
    const lngMin = longitude - longitudeDelta / 2;
    const lngMax = longitude + longitudeDelta / 2;

    try {
      const q = query(
        collection(db, 'events'),
        where('location.latitude', '>=', latMin),
        where('location.latitude', '<=', latMax),
        where('location.longitude', '>=', lngMin),
        where('location.longitude', '<=', lngMax)
      );

      const snapshot = await getDocs(q);
      const events = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setEvents(events);
    } catch (error) {
      console.error('Error fetching events in region:', error);
    }
  };

  // Call this function whenever the map region changes
  const handleRegionChangeComplete = (newRegion) => {
    setRegion(newRegion);
    fetchEventsInRegion(newRegion);
  };

  const getMarkerColor = (event) => {
    if (event.isSponsored) return '#9B59B6';
    if (event.isPopular) return '#F1C40F';
    if (event.isFriendHosting) return '#3498DB';
    if (event.isVisited) return '#FF7F50';
    return '#E74C3C';
  };

  // Close any active pop-ups when clicking on the map background
  const handleMapPress = () => {
    setSelectedEvent(null); // Close any active pop-ups
  };

  return (
    <View style={styles.container}>
      {showSearchBar && (
        <View style={styles.searchBarContainer}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder='Search places'
            value={searchQuery}
            onChangeText={handleSearchChange}
            onSubmitEditing={() => {
              if (searchResults.length > 0) {
                handlePlaceSelect(searchResults[0]);
              }
            }}
          />
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilterWindow((prev) => !prev)}
          >
            <Text style={styles.filterButtonText}>Filter</Text>
          </TouchableOpacity>
        </View>
      )}

      {filterVisible && (
        <View style={styles.filterContainer}>
          <Text style={styles.filterTitle}>Filter by Category</Text>
          <FlatList
            horizontal
            data={[
              { key: 'all', label: 'All' },
              ...allCategories.map((cat) => ({ key: cat, label: cat })),
            ]}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  selectedCategory === item.key && styles.filterOptionSelected,
                ]}
                onPress={() => {
                  setSelectedCategory(item.key);
                  setFilterVisible(false);
                }}
              >
                <Text>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {region && (
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={(r) => setRegion(r)}
          onLongPress={handleMapLongPress}
          onPress={handleMapPress} // Close pop-up on map press
        >
          {filteredEvents.map((event) => (
            <Marker
              key={event.id}
              coordinate={event.location}
              onPress={() => handleMarkerPress(event)}
              tracksViewChanges={false}
            >
              <CustomDotMarker
                color={getMarkerColor(event)}
                label={event.attendeeCount?.toString()}
                scale={markerScale}
              />
            </Marker>
          ))}

          {newEventLocation && (
            <Marker coordinate={newEventLocation} tracksViewChanges={false}>
              <CustomDotMarker color='#007AFF' scale={markerScale} />
            </Marker>
          )}
        </MapView>
      )}

      {showSearchResults && (
        <View style={styles.searchResultsContainer}>
          {searchLoading ? (
            <ActivityIndicator size='small' color='#007AFF' />
          ) : (
            <FlatList
              keyboardShouldPersistTaps='handled'
              data={searchResults}
              keyExtractor={(item) => item.place_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchResultItem}
                  onPress={() => handlePlaceSelect(item)}
                >
                  <Text>{item.description}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Event Pop-Up */}
      {selectedEvent && (
        <EventPopUpCard
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)} // Close the pop-up
        />
      )}

      {/* CTA FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleFabPress}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

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
            if (loc) {
              setRegion({
                ...loc,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              });
            }
            // Firestore listener will auto-update pins
          }}
        />
      </Modal>

      {/* List View Button */}
      <TouchableOpacity
        style={[styles.listViewButton, { zIndex: 10 }]}
        onPress={toggleListView}
      >
        <Ionicons name='list' size={24} color='#fff' />
      </TouchableOpacity>

      {/* List View */}
      {showListView && (
        <EventListView
          events={events}
          onEventPress={(event) => console.log(event)}
        />
      )}

      {/* Filter Window */}
      {showFilterWindow && (
        <EventFilterWindow
          isVisible={showFilterWindow}
          onClose={() => setShowFilterWindow(false)}
          onApplyFilters={(filters) => {
            console.log('Filters applied:', filters);
            applyFilters(filters);
            setShowFilterWindow(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  dot: {
    height: 20,
    width: 20,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  dotLabel: {
    color: '#fff',
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
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  fabIcon: { color: '#fff', fontSize: 32, lineHeight: 32 },
  searchBarContainer: {
    position: 'absolute',
    top: 70,
    left: 10,
    right: 80,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 5,
    paddingHorizontal: 10,
    alignItems: 'center',
    zIndex: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
  },
  filterButton: {
    position: 'absolute',
    right: -70,
    top: 0,
    height: 40,
    width: 70,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  filterButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  filterContainer: {
    position: 'absolute',
    top: 115,
    left: 10,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    elevation: 5,
    zIndex: 10,
  },
  filterTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  filterOption: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    marginRight: 10,
  },
  filterOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
    color: '#fff',
  },
  searchResultsContainer: {
    position: 'absolute',
    top: 90,
    left: 10,
    right: 10,
    maxHeight: 200,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 5,
    zIndex: 20,
  },
  searchResultItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  listViewButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    padding: 10,
    backgroundColor: '#007BFF',
    borderRadius: 8,
  },
  clusterContainer: {
    backgroundColor: 'rgba(0, 122, 255, 0.9)',
    padding: 5,
    borderRadius: 15,
  },
  clusterText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
