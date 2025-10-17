import { useState, useEffect } from 'react';
import { db } from '../../../firebase/config';

export function useEvents(interests = [], rollingDays = 7) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const queryRef = db
      .collection('events')
      .where('status', '==', 'active');

    let unsub = queryRef.onSnapshot(
      (snapshot) => {
        const now = Date.now();
        const docs = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // --- Exclude soft-deleted events ---
          .filter((event) => event.isDeleted !== true)
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
        if (error?.code === 'permission-denied') {
          // Likely signed-out or rules tightened; clear results quietly
          setEvents([]);
          try {
            unsub && unsub();
          } catch {}
          return;
        }
        console.error('Firestore onSnapshot error:', error);
      }
    );

    // Track globally so logout can proactively stop it
    try {
      if (!global.unsubscribeAllListeners) global.unsubscribeAllListeners = [];
      global.unsubscribeAllListeners.push(unsub);
    } catch {}

    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [rollingDays]);

  return events;
}
