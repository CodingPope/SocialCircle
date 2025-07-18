import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export function useEvents(interests = [], rollingDays = 7) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const now = Timestamp.now();
    const past = Timestamp.fromMillis(
      now.toMillis() - rollingDays * 24 * 60 * 60 * 1000
    );
    const eventsRef = collection(db, 'events');

    // Fetch all active events, no category filtering in Firestore
    const q = query(eventsRef, where('status', '==', 'active'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEvents(docs); // Always set the full list of events
      },
      (error) => {
        console.error('Firestore onSnapshot error:', error);
      }
    );

    return () => unsub && unsub();
  }, [rollingDays]);

  return events;
}
