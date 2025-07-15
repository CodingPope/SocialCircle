import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

const EventCard = ({ title, details, imageUrl }) => {
  return (
    <View style={styles.eventCard}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.eventImage}
          resizeMode='cover'
        />
      ) : (
        <View style={styles.eventImagePlaceholder}>
          <Image
            source={{ uri: 'https://placehold.co/60x40/orange/white' }}
            style={styles.eventImage}
          />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitle}>{title}</Text>
        <Text style={styles.eventDetails}>{details}</Text>
      </View>
      <TouchableOpacity style={styles.hamburgerButton}>
        <Text>Share</Text>
        {/* Replace with appropriate icon implementation */}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    // Android elevation
    elevation: 2,
  },
  eventImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 10,
  },
  eventImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#ccc',
    marginRight: 10,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  eventDetails: {
    fontSize: 14,
    color: '#555',
  },
  hamburgerButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
});

export default EventCard;
