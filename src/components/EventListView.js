import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { format } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import EventPopUpCard from './EventPopUpCard';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { MaterialIcons } from '@expo/vector-icons';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';

const EventListView = ({ events, onCloseListView }) => {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const bottomSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['25%', '60%', '90%'], []);

  const handleEventPress = (event) => {
    setSelectedEvent(event);
  };

  const closeModal = () => {
    setSelectedEvent(null);
  };

  const formatTimestamp = (timestamp) => {
    if (timestamp && timestamp.seconds) {
      return format(new Date(timestamp.seconds * 1000), 'MMM d, yyyy h:mm a');
    }
    return 'Invalid date';
  };

  const fetchUserProfilePicture = async (ownerId) => {
    try {
      const ref = doc(db, 'users', ownerId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const userData = snap.data();
        return userData.profileImage || userData.avatarURL || null;
      }
    } catch (err) {
      console.error('Error fetching user profile picture:', err);
    }
    return null;
  };

  const fetchCityAndState = async (location) => {
    try {
      const { latitude, longitude } = location;
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await res.json();
      if (data.status === 'OK' && data.results.length) {
        const addressComponents = data.results[0].address_components;
        const city = addressComponents.find((c) =>
          c.types.includes('locality')
        )?.short_name;
        const state = addressComponents.find((c) =>
          c.types.includes('administrative_area_level_1')
        )?.short_name;
        return city && state ? `${city}, ${state}` : 'Address not available';
      }
      console.warn('Geocoding API returned no results:', data);
      return 'Address not available';
    } catch (err) {
      console.error('Error fetching address:', err);
      return 'Error fetching address';
    }
  };

  const EventItem = ({ item }) => {
    const [profileImageUri, setProfileImageUri] = useState(null);
    const [address, setAddress] = useState('Fetching address...');

    useEffect(() => {
      if (item.ownerId) {
        fetchUserProfilePicture(item.ownerId).then(setProfileImageUri);
      }
      if (item.location) {
        fetchCityAndState(item.location).then(setAddress);
      } else {
        setAddress('Location not specified');
      }
    }, [item.ownerId, item.location]);

    const openInMaps = () => {
      if (item.location) {
        const { latitude, longitude } = item.location;
        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        Linking.openURL(url);
      }
    };

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => handleEventPress(item)}
      >
        {item.imageUrl && (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.eventImage}
            resizeMode='cover'
          />
        )}
        <View style={styles.eventDetailsContainer}>
          <Text style={styles.eventTitle}>
            {item.title || 'Untitled Event'}
          </Text>
          <View style={styles.eventInfoRow}>
            <Image
              source={
                profileImageUri
                  ? { uri: profileImageUri }
                  : require('../../assets/smileDefault.png')
              }
              style={styles.userProfilePic}
            />
            <View style={styles.eventInfoTextContainer}>
              <Text style={styles.eventTime}>{formatTimestamp(item.date)}</Text>
              <TouchableOpacity
                style={styles.addressContainer}
                onPress={openInMaps}
              >
                <MaterialIcons name='location-pin' size={16} color='blue' />
                <Text style={styles.eventLocation}>{address}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.eventFooterRow}>
            <Text style={styles.eventCapacity}>
              {item.capacity
                ? `${item.attendees?.length || 0}/${item.capacity} Going`
                : `${item.attendees?.length || 0} Going`}
            </Text>
            <TouchableOpacity style={styles.rsvpButton}>
              <Text style={styles.rsvpButtonText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Custom header for BottomSheet with close button and drag indicator
  const renderHeader = () => (
    <View style={styles.sheetHeader}>
      <View style={styles.dragBarContainer}>
        <View style={styles.dragBar} />
      </View>

      <Text style={styles.sheetTitle}>List view</Text>
    </View>
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onCloseListView}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior='close'
        />
      )}
      backgroundStyle={styles.bottomSheetBg}
      handleComponent={renderHeader}
    >
      <BottomSheetFlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EventItem item={item} />}
        contentContainerStyle={styles.listContainer}
      />
      {selectedEvent && (
        <EventPopUpCard
          event={selectedEvent}
          onClose={closeModal}
          onJoin={() => {
            console.log('Join event logic here');
            closeModal();
          }}
        />
      )}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  bottomSheetBg: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // Add relative positioning for drag bar
    position: 'relative',
    justifyContent: 'center',
  },
  dragBarContainer: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  dragBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#e0e0e0',
    marginBottom: 4,
  },

  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
    color: '#222',
    marginTop: 8,
  },
  listContainer: {
    padding: 10,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  eventImage: {
    width: '100%',
    height: 200,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  eventDetailsContainer: {
    padding: 10,
  },
  eventInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  userProfilePic: {
    width: 50,
    height: 50,
    borderRadius: 10,
    marginRight: 10,
  },
  eventInfoTextContainer: {
    flex: 1,
  },
  eventFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  eventTime: {
    fontSize: 14,
    color: '#666',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  eventLocation: {
    fontSize: 14,
    color: 'blue',
    marginLeft: 4,
  },
  eventCapacity: {
    fontSize: 14,
    color: '#333',
  },
  rsvpButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
  },
  rsvpButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default EventListView;
