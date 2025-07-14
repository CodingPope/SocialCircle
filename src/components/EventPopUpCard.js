import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@env'; // Ensure you have this in your .env file

export default function EventPopUpCard({ event }) {
  const [address, setAddress] = useState('Fetching address...');

  useEffect(() => {
    if (event.location && event.location.latitude && event.location.longitude) {
      const fetchAddress = async () => {
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${event.location.latitude},${event.location.longitude}&key=${GOOGLE_MAPS_API_KEY}`
          );
          const data = await response.json();
          if (data.status === 'OK' && data.results.length > 0) {
            setAddress(data.results[0].formatted_address);
          } else {
            setAddress('Address not available');
          }
        } catch (error) {
          console.error('Error fetching address:', error);
          setAddress('Error fetching address');
        }
      };
      fetchAddress();
    } else {
      setAddress('Location not specified');
    }
  }, [event.location]);

  return (
    <View style={styles.card}>
      {/* Event Image */}
      {event.imageUri ? (
        <Image
          source={{ uri: event.imageUri }}
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

        {/* Event Category */}
        {event.category && (
          <Text style={styles.categoryTag}>{event.category}</Text>
        )}

        {/* Event Description */}
        <Text style={styles.label}>Description:</Text>
        <Text style={styles.description}>
          {event.description || 'No description available.'}
        </Text>

        {/* Event Location */}
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

        {/* Event Creator */}
        {event.user && (
          <View style={styles.userContainer}>
            <Image
              source={{
                uri:
                  event.user.profilePicture || 'https://via.placeholder.com/50',
              }}
              style={styles.userImage}
            />
            <View>
              <Text style={styles.userName}>
                {event.user.name || 'Anonymous'}
              </Text>
              <Text style={styles.userRating}>★★★★★ (65 reviews)</Text>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.joinButton}>
            <Text style={styles.joinButtonText}>Join Event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton}>
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 0, // Start from the bottom of the screen
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'scroll',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 6,
    elevation: 10, // Ensure it appears above other elements
    zIndex: 100, // Higher zIndex to layer above FAB and toggle button
  },
  image: {
    width: '100%',
    height: 200,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#888',
  },
  infoContainer: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  categoryTag: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#555',
    marginBottom: 12,
  },
  subText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  userContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  userImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  userRating: {
    fontSize: 14,
    color: '#FFD700',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  joinButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  joinButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  shareButton: {
    backgroundColor: '#555',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    flex: 1,
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
