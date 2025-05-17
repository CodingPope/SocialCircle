import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const EventCard = ({ title, details }) => {
  return (
    <View style={styles.eventCard}>
      <View style={styles.eventImagePlaceholder} />
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
  eventImagePlaceholder: {
    width: 50,
    height: 50,
    backgroundColor: '#ddd',
    borderRadius: 8,
    marginRight: 12,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  eventDetails: {
    fontSize: 13,
    color: '#555',
  },
  hamburgerButton: {
    padding: 8,
  },
});

export default EventCard;
