import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';

function chunkArray(arr, chunkSize) {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

/**
 * 🔥 Fetch "Hot" events
 */
export async function fetchHotEvents(
  interests,
  userLocation,
  radiusInM = 32093
) {
  try {
    if (!userLocation || !interests?.length) return [];

    const center = [userLocation.latitude, userLocation.longitude];
    const bounds = geohashQueryBounds(center, radiusInM);
    const interestChunks =
      interests.length > 10 ? chunkArray(interests, 10) : [interests];
    const promises = [];

    for (const interestChunk of interestChunks) {
      for (const b of bounds) {
        const q = query(
          collection(db, 'events'),
          where('geohash', '>=', b[0]),
          where('geohash', '<=', b[1]),
          where('interest', 'in', interestChunk),
          where('status', '==', 'active'),
          where('date', '>=', Timestamp.now())
        );
        promises.push(getDocs(q));
      }
    }

    const snapshots = await Promise.allSettled(promises);
    const matchingDocs = new Map();

    for (const result of snapshots) {
      if (result.status === 'fulfilled') {
        for (const doc of result.value.docs) {
          const data = doc.data();
          const loc = [data.location.latitude, data.location.longitude];
          const distance = distanceBetween(center, loc) * 1000;
          if (distance <= radiusInM && !matchingDocs.has(doc.id)) {
            matchingDocs.set(doc.id, { id: doc.id, ...data });
          }
        }
      }
    }

    const results = Array.from(matchingDocs.values());
    console.log('[🔥 Hot Feed] Matching events:', results.length);
    return results;
  } catch (error) {
    console.error('Error fetching Hot events:', error);
    return [];
  }
}

/**
 * 🆕 Fetch "New" events from last 24h within radius
 */
export async function fetchNewEvents(
  selectedInterest,
  userLocation,
  lastDoc = null,
  pageSize = 10,
  radiusInM = 23000
) {
  try {
    if (!selectedInterest || !userLocation)
      return { events: [], lastDoc: null };

    const center = [userLocation.latitude, userLocation.longitude];
    const bounds = geohashQueryBounds(center, radiusInM);
    const now = Date.now();
    const twentyFourHoursAgo = Timestamp.fromMillis(now - 24 * 60 * 60 * 1000);

    const promises = bounds.map((b) =>
      getDocs(
        query(
          collection(db, 'events'),
          where('geohash', '>=', b[0]),
          where('geohash', '<=', b[1]),
          where('interest', '==', selectedInterest),
          where('status', '==', 'active'),
          where('createdAt', '>=', twentyFourHoursAgo)
        )
      )
    );

    const snapshots = await Promise.all(promises);

    const matchingDocs = new Map();
    for (const snap of snapshots) {
      for (const doc of snap.docs) {
        const data = doc.data();
        const loc = [data.location.latitude, data.location.longitude];
        const distance = distanceBetween(center, loc) * 1000;
        if (distance <= radiusInM && !matchingDocs.has(doc.id)) {
          matchingDocs.set(doc.id, { id: doc.id, ...data });
        }
      }
    }

    const results = Array.from(matchingDocs.values()).sort(
      (a, b) => b.createdAt.seconds - a.createdAt.seconds
    );
    return { events: results.slice(0, pageSize), lastDoc: null };
  } catch (err) {
    console.error('Error fetching New events:', err);
    return { events: [], lastDoc: null };
  }
}

/**
 * 📅 Fetch "This Week" events within radius
 */
export async function fetchThisWeekEvents(
  selectedInterest,
  userLocation,
  lastDoc = null,
  pageSize = 10,
  radiusInM = 23000
) {
  try {
    if (!selectedInterest || !userLocation)
      return { events: [], lastDoc: null };

    const center = [userLocation.latitude, userLocation.longitude];
    const bounds = geohashQueryBounds(center, radiusInM);
    const now = Timestamp.now();
    const weekFromNow = Timestamp.fromMillis(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    );

    const promises = bounds.map((b) =>
      getDocs(
        query(
          collection(db, 'events'),
          where('geohash', '>=', b[0]),
          where('geohash', '<=', b[1]),
          where('interest', '==', selectedInterest),
          where('status', '==', 'active'),
          where('date', '>=', now),
          where('date', '<=', weekFromNow)
        )
      )
    );

    const snapshots = await Promise.all(promises);

    const matchingDocs = new Map();
    for (const snap of snapshots) {
      for (const doc of snap.docs) {
        const data = doc.data();
        const loc = [data.location.latitude, data.location.longitude];
        const distance = distanceBetween(center, loc) * 1000;
        if (distance <= radiusInM && !matchingDocs.has(doc.id)) {
          matchingDocs.set(doc.id, { id: doc.id, ...data });
        }
      }
    }

    const results = Array.from(matchingDocs.values()).sort(
      (a, b) => a.date.seconds - b.date.seconds
    );
    return { events: results.slice(0, pageSize), lastDoc: null };
  } catch (err) {
    console.error('Error fetching This Week events:', err);
    return { events: [], lastDoc: null };
  }
}
