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
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  where,
  orderBy,
  doc,
  getDoc,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import CreateEventScreen from './CreateEventScreen';
import { GOOGLE_MAPS_API_KEY } from '@env';
import EventListView from '../../components/EventListView';
import EventFilterWindow from '../../components/EventFilterWindow';
import EventPopUp from '../../components/EventPopUp';
import EventPopUpCard from '../../components/EventPopUpCard';

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
          onRegionChangeComplete={setRegion}
          onLongPress={handleMapLongPress}
          onPress={() => {
            setShowListView(false);
            setSelectedEvent(null); // Hide pop-up when clicking off
          }}
        >
          {filteredEvents.map((ev) => {
            // Defensive check for valid location
            if (
              !ev.location ||
              !ev.location.latitude ||
              !ev.location.longitude
            ) {
              console.log('Event missing location:', ev);
              return null;
            }
            return (
              <Marker
                key={ev.id}
                coordinate={ev.location}
                onPress={() => handleMarkerPress(ev)}
              />
            );
          })}
          {newEventLocation && (
            <Marker coordinate={newEventLocation} pinColor='blue' />
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
      {selectedEvent && <EventPopUpCard event={selectedEvent} />}

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
      <TouchableOpacity style={styles.listViewButton} onPress={toggleListView}>
        <Text>Toggle List View</Text>
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
          onApplyFilters={(filters) => {
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
});
