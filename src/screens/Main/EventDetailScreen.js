import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import AttendeeList from '../../components/AttendeeList';

export default function EventDetailScreen({ route, navigation }) {
  const { eventId } = route.params;
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const db = getFirestore();

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (eventDoc.exists()) {
          setEvent({ id: eventDoc.id, ...eventDoc.data() });
        } else {
          console.error('Event not found');
        }
      } catch (err) {
        console.error('Error fetching event:', err);
      }
    };
    fetchEvent();
  }, [eventId]);

  if (!event) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{event.title}</Text>
      {event.imageUrl && (
        <Image source={{ uri: event.imageUrl }} style={styles.image} />
      )}
      <Text>{event.description}</Text>

      <Text style={{ marginTop: 16, fontWeight: 'bold' }}>Attendees</Text>
      <AttendeeList
        attendees={event.attendees || []}
        eventId={eventId}
        isCreator={event.ownerId === user?.uid}
        navigation={navigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 16,
  },
});
