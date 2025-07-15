import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Dimensions,
} from 'react-native';

const screenHeight = Dimensions.get('window').height;

const EventPopUp = ({ event, onClose, onJoin }) => {
  const slideAnim = useRef(new Animated.Value(300)).current; // Start off-screen

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 20, // Slide to visible position
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        transform: [{ translateY: slideAnim }],
        ...styles.container,
      }}
    >
      {/* Event Content */}
      <ScrollView>
        {/* Display event image or placeholder */}
        <Image
          source={{ uri: event.imageUrl || 'https://via.placeholder.com/150' }}
          style={styles.image}
        />

        {/* Event title and category */}
        <Text style={styles.title}>{event.title || 'Untitled Event'}</Text>
        <Text style={styles.category}>{event.category || 'No Category'}</Text>

        {/* Event details */}
        <Text style={styles.detailsTitle}>Details</Text>
        <Text style={styles.details}>
          {event.description || 'No details available.'}
        </Text>

        {/* Event location */}
        <Text style={styles.addressTitle}>Address</Text>
        <Text style={styles.address}>
          {event.location &&
          typeof event.location.latitude === 'number' &&
          typeof event.location.longitude === 'number'
            ? `Latitude: ${event.location.latitude.toFixed(
                6
              )}, Longitude: ${event.location.longitude.toFixed(6)}`
            : 'Location not specified.'}
        </Text>

        {/* Join and Share buttons */}
        <TouchableOpacity style={styles.joinButton} onPress={onJoin}>
          <Text style={styles.joinButtonText}>Join</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareButton}>
          <Text style={styles.shareButtonText}>Share</Text>
        </TouchableOpacity>

        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    maxHeight: screenHeight * 0.7, // Limit height to 70% of screen
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  image: {
    width: '100%',
    height: 150,
    borderRadius: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    margin: 10,
  },
  category: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
  },
  details: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  addressTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
  },
  address: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  joinButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
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
    marginBottom: 10,
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  closeButton: {
    alignItems: 'center',
    marginTop: 10,
  },
  closeButtonText: {
    color: '#007BFF',
    fontWeight: 'bold',
  },
});

export default EventPopUp;
