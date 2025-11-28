// src/hooks/useMyEvents.js
import { useState, useEffect } from 'react';
import { db } from '../../../services/firebase/config';

export function useMyEvents(creatorId) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // If creatorId is not provided, reset events and exit early
    if (!creatorId) {
      setEvents([]);
      return;
    }

    // Avoid composite index: only filter by ownerId and sort client-side
    const queryRef = db
      .collection('events')
      .where('ownerId', '==', creatorId);

    let unsub = queryRef.onSnapshot(
      (snapshot) => {
        const now = Date.now();
        const list = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
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
          })
          // --- Sort by createdAt desc on client ---
          .sort((a, b) => {
            const getMs = (x) =>
              x?.createdAt?.toDate?.()
                ? x.createdAt.toDate().getTime()
                : x?.createdAt?.seconds
                ? x.createdAt.seconds * 1000
                : x?.createdAt instanceof Date
                ? x.createdAt.getTime()
                : 0;
            return getMs(b) - getMs(a);
          });
        setEvents(list);
      },
      (error) => {
        // Clear and unsubscribe on permission issues (logout/rules)
        if (error?.code === 'permission-denied') {
          setEvents([]);
          try {
            unsub && unsub();
          } catch {}
          return;
        }
        console.error(
          'Firestore snapshot listener error in useMyEvents:',
          error
        );
      }
    );

    // Track globally so logout can proactively stop it
    try {
      if (!global.unsubscribeAllListeners) global.unsubscribeAllListeners = [];
      global.unsubscribeAllListeners.push(unsub);
    } catch {}

    // Cleanup subscription on component unmount or dependency change
    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [creatorId]);

  return events;
}
