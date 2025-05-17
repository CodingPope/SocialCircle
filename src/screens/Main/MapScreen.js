import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  Modal,
} from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import Icon from 'react-native-vector-icons/Ionicons';
import BottomSheet from '@gorhom/bottom-sheet';
import EventPopUpCard from '../../components/EventPopUpCard';
import CreateEventScreen from './CreateEventScreen';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';

export default function MapScreen({ navigation }) {
  const [events, setEvents] = useState([]);
  const [region, setRegion] = useState({
    latitude: 39.7392,
    longitude: -104.9903,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);

  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['25%', '50%', '80%'], []);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const getEvents = httpsCallable(functions, 'getEvents');
        const result = await getEvents();
        setEvents(result.data.events);
      } catch (error) {
        console.error('Error fetching events:', error);
      }
    };

    fetchEvents();
  }, []);

  const handleMarkerPress = (eventData) => {
    setSelectedEvent(eventData);
    bottomSheetRef.current?.expand();
  };

  const handleCreateEventClose = () => {
    setShowCreateEventModal(false);
  };

  const handleCreateEventSuccess = () => {
    setShowCreateEventModal(false);
    // Optionally refresh events or other actions on success
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
      >
        <View style={styles.header}>
          <TextInput
            style={styles.searchInput}
            placeholder='Search...'
            placeholderTextColor='#888'
          />
          <TouchableOpacity style={styles.filterIcon}>
            <Icon name='filter' size={24} color='#000' />
          </TouchableOpacity>
        </View>
        {events.map((ev) => (
          <Marker
            key={ev.id}
            coordinate={{ latitude: ev.lat, longitude: ev.lng }}
          >
            <Callout tooltip onPress={() => handleMarkerPress(ev)}>
              <View style={styles.callout}>
                <EventPopUpCard event={ev} />
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => setShowCreateEventModal(true)}
      >
        <Icon name='add' size={30} color='#fff' />
      </TouchableOpacity>
      <BottomSheet
        ref={bottomSheetRef}
        index={-1} // start closed
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        onChange={(index) => {
          if (index === -1) {
            setSelectedEvent(null);
          }
        }}
      >
        <View style={styles.bottomSheetContent}>
          {selectedEvent ? (
            <EventPopUpCard event={selectedEvent} />
          ) : (
            <Text style={styles.noEventText}>Tap a marker to see details</Text>
          )}
        </View>
      </BottomSheet>

      <Modal
        visible={showCreateEventModal}
        animationType='slide'
        onRequestClose={handleCreateEventClose}
        presentationStyle='pageSheet'
      >
        <CreateEventScreen
          onClose={handleCreateEventClose}
          onSuccess={handleCreateEventSuccess}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  header: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderColor: 'black',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    marginRight: 10,
  },
  filterIcon: { padding: 10 },
  bottomSheetContent: {
    flex: 1,
    padding: 20,
  },
  noEventText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  callout: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  calloutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  floatingButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: '#007BFF',
    width: 60,
    height: 60,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    zIndex: 10,
  },
});
