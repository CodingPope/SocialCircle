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
        const now = Date.now();
        const docs = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // --- Remove expired events (date + 1 hour) ---
          .filter((event) => {
            let eventTime = null;
            if (event.endAt) {
              if (event.endAt.toDate)
                eventTime = event.endAt.toDate().getTime();
              else if (event.endAt.seconds)
                eventTime = event.endAt.seconds * 1000;
            } else if (event.date) {
              if (event.date.toDate) eventTime = event.date.toDate().getTime();
              else if (event.date.seconds)
                eventTime = event.date.seconds * 1000;
              else if (event.date instanceof Date)
                eventTime = event.date.getTime();
            }
            return eventTime && eventTime + 60 * 60 * 1000 > now;
          });
        setEvents(docs); // Always set the filtered list of events
      },
      (error) => {
        console.error('Firestore onSnapshot error:', error);
      }
    );

    return () => unsub && unsub();
  }, [rollingDays]);

  return events;
}
