// src/screens/Main/EventDetailScreen.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function EventDetailScreen({ route }) {
  const { eventId } = route.params;

  return (
    <View style={styles.container}>
      <Text>Event Detail</Text>
      <Text>{eventId}</Text>
      {/* Later: Fetch event info from Firestore, show attendees, comments, RSVP button */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
