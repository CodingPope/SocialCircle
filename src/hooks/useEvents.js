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

    let unsub;
    try {
      unsub = onSnapshot(
        q,
        (snapshot) => {
          console.log('Snapshot size:', snapshot.size);
          let docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          // Filter by interests in JS if interests provided
          if (interests.length > 0) {
            docs = docs.filter((ev) => interests.includes(ev.category));
          }
          console.log('Filtered events - useEvents:', docs);
          setEvents(docs);
        },
        (error) => {
          console.error('Firestore onSnapshot error:', error);
        }
      );
    } catch (err) {
      console.warn('Firestore index not ready, returning empty events:', err);
      setEvents([]); // gracefully handle until index exists
    }

    return () => unsub && unsub();
  }, [interests.join(','), rollingDays]);

  return events;
}
