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
    if (!creatorId) {
      setEvents([]);
      return;
    }

    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('creatorId', '==', creatorId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEvents(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        console.error(
          'Firestore snapshot listener error in useMyEvents:',
          error
        );
      }
    );
    return () => unsubscribe();
  }, [creatorId]);

  return events;
}
