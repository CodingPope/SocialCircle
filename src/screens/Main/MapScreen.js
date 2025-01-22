// src/screens/Main/MapScreen.js
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Icon from 'react-native-vector-icons/Ionicons';

// Mock events for now
const mockEvents = [
  { id: 'e1', title: 'Coffee Meetup', lat: 37.78825, lng: -122.4324 },
  { id: 'e2', title: 'Concert Night', lat: 37.78925, lng: -122.4224 },
];

export default function MapScreen({ navigation }) {
  const [region, setRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });

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
        {mockEvents.map((ev) => (
          <Marker
            key={ev.id}
            coordinate={{ latitude: ev.lat, longitude: ev.lng }}
            title={ev.title}
            onCalloutPress={() =>
              navigation.navigate('EventDetail', { eventId: ev.id })
            }
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  /** Header bar with title and menu icon */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    backgroundColor: 'white',
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
  filterIcon: {
    padding: 10,
  },
});
