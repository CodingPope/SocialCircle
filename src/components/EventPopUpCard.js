import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

export default function EventPopUpCard({ event }) {
  console.log('Event data received:', event);
  return (
    <View style={styles.card}>
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
      <View style={styles.infoContainer}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.subText}>Posted by: {event.poster}</Text>
        <Text style={styles.subText}>Rating: {event.rating.toFixed(1)}</Text>
        <Text style={styles.subText}>
          Date/Time: {new Date(event.dateTime).toLocaleString()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#eee',
    borderRadius: 12,
    overflow: 'hidden',
    // iOS shadow
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    // Android elevation
    elevation: 2,
  },
  image: {
    width: '100%',
    height: 200,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#eee',
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
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  subText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
});
