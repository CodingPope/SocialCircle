import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function EventDetails({ route }) {
  const { eventId } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Event Details</Text>
      <Text style={styles.eventId}>Event ID: {eventId}</Text>
      {/* Add logic to fetch and display event details */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  eventId: {
    fontSize: 16,
    color: '#333',
  },
});
