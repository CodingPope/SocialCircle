// src/screens/Main/EventPopUpCard.js

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { useNavigation } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const screenHeight = Dimensions.get('window').height;

export default function EventPopUpCard({ event, onClose, onJoin }) {
  const navigation = useNavigation();
  const [address, setAddress] = useState('Fetching address...');
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [userDetails, setUserDetails] = useState(null);
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const bottomNavHeight = 240;

  // Slide-in animation
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: screenHeight * 0.3 - bottomNavHeight,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  // Fetch formatted address
  useEffect(() => {
    if (!event.location) {
      setAddress('Location not specified');
      return;
    }
    const fetchAddress = async () => {
      try {
        const { latitude, longitude } = event.location;
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await res.json();
        if (data.status === 'OK' && data.results.length) {
          setAddress(data.results[0].formatted_address);
        } else {
          setAddress('Address not available');
        }
      } catch (err) {
        console.error('Address fetch error:', err);
        setAddress('Error fetching address');
      }
    };
    fetchAddress();
  }, [event.location]);

  // Fetch event creator details
  useEffect(() => {
    const ownerId = event.ownerID || event.ownerId;
    if (!ownerId) {
      console.warn('Missing ownerID for event', event.id);
      return;
    }
    const fetchUser = async () => {
      try {
        const ref = doc(db, 'users', ownerId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setUserDetails({ id: snap.id, ...snap.data() });
        } else {
          console.warn('No user document for ID', ownerId);
        }
      } catch (err) {
        console.error('Error fetching user details:', err);
      }
    };
    fetchUser();
  }, [event.ownerID, event.ownerId, event.id]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: screenHeight,
      duration: 200,
      useNativeDriver: true,
    }).start(onClose || (() => {}));
  };

  const handleUserPress = () => {
    if (userDetails?.id) {
      navigation.navigate('UserProfile', { userId: userDetails.id });
    }
  };

  const truncatedDescription =
    event.description && event.description.length > 300
      ? `${event.description.slice(0, 300)}...`
      : event.description;

  // Determine display name and profile image key
  const displayName = userDetails
    ? `${userDetails.firstName || ''} ${userDetails.lastName || ''}`.trim() ||
      userDetails.name ||
      'Anonymous'
    : 'Anonymous';
  const profileImageUri =
    userDetails?.profileImage || userDetails?.avatarURL || null;

  return (
    <Animated.View
      style={{
        transform: [{ translateY: slideAnim }],
        ...styles.card,
        maxHeight: screenHeight * 0.7,
      }}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Event Image */}
        {event.imageUri || event.imageUrl ? (
          <Image
            source={{ uri: event.imageUri || event.imageUrl }}
            style={styles.image}
            resizeMode='cover'
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}

        {/* Event Details */}
        <View style={styles.infoContainer}>
          <Text style={styles.title}>{event.title || 'Untitled Event'}</Text>
          {event.category && (
            <Text style={styles.categoryTag}>{event.category}</Text>
          )}

          <Text style={styles.label}>Description:</Text>
          <Text style={styles.description}>
            {showFullDescription ? event.description : truncatedDescription}
          </Text>
          {event.description && event.description.length > 300 && (
            <TouchableOpacity
              onPress={() => setShowFullDescription((prev) => !prev)}
            >
              <Text style={styles.readMoreText}>
                {showFullDescription ? 'Read Less' : 'Read More'}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.label}>Address:</Text>
          <Text
            style={[styles.subText, { color: 'blue' }]}
            onPress={() => {
              if (event.location) {
                const url = `https://www.google.com/maps?q=${event.location.latitude},${event.location.longitude}`;
                Linking.openURL(url);
              }
            }}
          >
            {address}
          </Text>

          {/* Creator Info */}
          {userDetails && (
            <TouchableOpacity
              style={styles.userContainer}
              onPress={handleUserPress}
            >
              <Image
                source={
                  profileImageUri
                    ? { uri: profileImageUri }
                    : require('../../assets/smileDefault.png')
                }
                style={styles.userImage}
              />
              <View>
                <Text style={styles.userName}>{displayName}</Text>
                <Text style={styles.userRating}>
                  {'★'.repeat(Math.round(userDetails.rating || 0))}{' '}
                  {userDetails.ratingCount || 0} reviews
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.joinButton} onPress={onJoin}>
            <Text style={styles.joinButtonText}>Join Event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton}>
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 6,
    elevation: 10,
    zIndex: 100,
  },
  scrollContent: { paddingBottom: 20 },
  image: { width: '100%', height: 200 },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { fontSize: 16, color: '#888' },
  infoContainer: { padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  categoryTag: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: { fontSize: 14, color: '#333', fontWeight: 'bold', marginBottom: 4 },
  description: { fontSize: 14, color: '#555', marginBottom: 12 },
  readMoreText: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: 'bold',
    marginTop: 4,
  },
  subText: { fontSize: 14, color: '#666', marginBottom: 8 },
  userContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  userImage: { width: 40, height: 40, borderRadius: 10, marginRight: 8 },
  userName: { fontSize: 16, fontWeight: 'bold' },
  userRating: { fontSize: 14, color: '#FFD700' },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  joinButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  shareButton: {
    backgroundColor: '#555',
    padding: 10,
    borderRadius: 5,
    flex: 1,
    alignItems: 'center',
  },
  closeButton: { alignItems: 'center', marginTop: 10 },
  closeButtonText: { color: '#007BFF', fontWeight: 'bold' },
});
