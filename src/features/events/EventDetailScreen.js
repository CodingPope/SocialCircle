import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { useUserStore } from '../profile/userStore';
import AttendeeList from './AttendeeList';

export default function EventDetailScreen({ route, navigation }) {
  const { eventId } = route.params;
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const [event, setEvent] = useState(null);
  const db = getFirestore();

  // Derived: soft-delete and expiry checks to control UI
  const isSoftDeleted = event?.isDeleted === true;
  const isExpired = (() => {
    if (!event) return false;
    let eventTime = null;
    if (event.endAt) {
      if (event.endAt.toDate) eventTime = event.endAt.toDate().getTime();
      else if (event.endAt.seconds) eventTime = event.endAt.seconds * 1000;
    } else if (event.date) {
      if (event.date.toDate) eventTime = event.date.toDate().getTime();
      else if (event.date.seconds) eventTime = event.date.seconds * 1000;
      else if (event.date instanceof Date) eventTime = event.date.getTime();
    }
    if (!eventTime) return false;
    return eventTime + 60 * 60 * 1000 <= Date.now();
  })();

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (eventDoc.exists()) {
          const next = { id: eventDoc.id, ...eventDoc.data() };
          setEvent((prev) => {
            if (
              prev &&
              prev.id === next.id &&
              prev.updatedAt?.seconds === next.updatedAt?.seconds
            ) {
              return prev;
            }
            return next;
          });
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
      {/* Archived / Ended banner (non-interactive state indicator) */}
      {(isSoftDeleted || isExpired) && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {isSoftDeleted
              ? 'This event has been archived.'
              : 'This event has ended.'}
          </Text>
        </View>
      )}
      <Text style={styles.title}>{event.title}</Text>
      {event.imageUrl && (
        <Image source={{ uri: event.imageUrl }} style={styles.image} />
      )}
      <Text>{event.description}</Text>

      <Text style={{ marginTop: 16, fontWeight: 'bold' }}>Attendees</Text>
      {/* If archived/ended, show attendees but disable interactive actions in child components where applicable */}
      <AttendeeList
        attendees={event.attendees || []}
        attendeeSnippets={event.attendeeSnippets || null}
        attendeesCount={
          typeof event.attendeesCount === 'number' ? event.attendeesCount : null
        }
        eventId={eventId}
        isCreator={event.ownerId === user?.uid}
        navigation={navigation}
        // Pass readOnly flag so child components can disable controls if implemented
        readOnly={isSoftDeleted || isExpired}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  banner: {
    backgroundColor: '#FFF4E5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  bannerText: { color: '#8A5600', fontWeight: '600' },
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
