// src/hooks/useMyEvents.js
import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export function useMyEvents(creatorId) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // If creatorId is not provided, reset events and exit early
    if (!creatorId) {
      setEvents([]);
      return;
    }

    // Reference to the 'events' collection in Firestore
    const eventsRef = collection(db, 'events');

    // Firestore query: Filter by creatorId and order by createdAt (descending)
    const q = query(
      eventsRef,
      where('creatorId', '==', creatorId),
      orderBy('createdAt', 'desc')
    );

    // Subscribe to Firestore snapshot updates
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Map Firestore documents to an array of event objects
        setEvents(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        // Enhanced error handling
        if (error.code === 'failed-precondition') {
          console.error(
            'Firestore index missing. Please create the required index.'
          );
        } else {
          console.error(
            'Firestore snapshot listener error in useMyEvents:',
            error
          );
        }
      }
    );

    // Cleanup subscription on component unmount or dependency change
    return () => unsubscribe();
  }, [creatorId]);

  return events;
}
