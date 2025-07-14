import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function EventDetailScreen({ route }) {
  const { eventId } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Event Detail</Text>
      <Text>Event ID: {eventId}</Text>
      {/* TODO: Implement event detail UI */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
});
