import { db, Timestamp, getTimestampNow } from '../../../firebase/config';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { getWithTTL } from '../utils/ttlCache';

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

    const doFetch = async () => {
      const promises = [];
      for (const interestChunk of interestChunks) {
        for (const b of bounds) {
          const queryRef = db
            .collection('events')
            .where('geohash', '>=', b[0])
            .where('geohash', '<=', b[1])
            .where('interest', 'in', interestChunk)
            .where('status', '==', 'active')
            .where('isDeleted', '==', false)
            .where('date', '>=', getTimestampNow());
          promises.push(queryRef.get());
        }
      }

      const snapshots = await Promise.allSettled(promises);
      const matchingDocs = new Map();

      for (const result of snapshots) {
        if (result.status === 'fulfilled') {
          for (const doc of result.value.docs) {
            const data = doc.data();
            if (data?.isDeleted === true) continue;
            if (
              !data.location ||
              data.location.latitude == null ||
              data.location.longitude == null
            )
              continue;
            const loc = [data.location.latitude, data.location.longitude];
            const distance = distanceBetween(center, loc) * 1000;
            if (distance <= radiusInM && !matchingDocs.has(doc.id)) {
              matchingDocs.set(doc.id, { id: doc.id, ...data });
            }
          }
        }
      }

      return Array.from(matchingDocs.values());
    };

    const key = `hot:${center.join(',')}:${radiusInM}:${interests
      .slice(0, 10)
      .sort()
      .join('|')}`;
    // Short TTL for feed freshness (2 minutes)
    return await getWithTTL(key, doFetch, 2 * 60 * 1000);
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

    const doFetch = async () => {
      const promises = bounds.map((b) =>
        db
          .collection('events')
          .where('geohash', '>=', b[0])
          .where('geohash', '<=', b[1])
          .where('interest', '==', selectedInterest)
          .where('status', '==', 'active')
          .where('isDeleted', '==', false)
          .where('createdAt', '>=', twentyFourHoursAgo)
          .get()
      );

      const snapshots = await Promise.all(promises);

      const matchingDocs = new Map();
      for (const snap of snapshots) {
        for (const doc of snap.docs) {
          const data = doc.data();
          if (data?.isDeleted === true) continue;
          if (
            !data.location ||
            data.location.latitude == null ||
            data.location.longitude == null
          )
            continue;
          const loc = [data.location.latitude, data.location.longitude];
          const distance = distanceBetween(center, loc) * 1000;
          if (distance <= radiusInM && !matchingDocs.has(doc.id)) {
            matchingDocs.set(doc.id, { id: doc.id, ...data });
          }
        }
      }

      const results = Array.from(matchingDocs.values()).sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      return { events: results.slice(0, pageSize), lastDoc: null };
    };

    const key = `new:${center.join(',')}:${radiusInM}:${selectedInterest}`;
    const res = await getWithTTL(key, doFetch, 2 * 60 * 1000);
    return res;
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
    const now = getTimestampNow();
    const weekFromNow = Timestamp.fromMillis(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    );

    const doFetch = async () => {
      const promises = bounds.map((b) =>
        db
          .collection('events')
          .where('geohash', '>=', b[0])
          .where('geohash', '<=', b[1])
          .where('interest', '==', selectedInterest)
          .where('status', '==', 'active')
          .where('isDeleted', '==', false)
          .where('date', '>=', now)
          .where('date', '<=', weekFromNow)
          .get()
      );

      const snapshots = await Promise.all(promises);

      const matchingDocs = new Map();
      for (const snap of snapshots) {
        for (const doc of snap.docs) {
          const data = doc.data();
          if (data?.isDeleted === true) continue;
          if (
            !data.location ||
            data.location.latitude == null ||
            data.location.longitude == null
          )
            continue;
          const loc = [data.location.latitude, data.location.longitude];
          const distance = distanceBetween(center, loc) * 1000;
          if (distance <= radiusInM && !matchingDocs.has(doc.id)) {
            matchingDocs.set(doc.id, { id: doc.id, ...data });
          }
        }
      }

      const results = Array.from(matchingDocs.values()).sort(
        (a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0)
      );
      return { events: results.slice(0, pageSize), lastDoc: null };
    };

    const key = `week:${center.join(',')}:${radiusInM}:${selectedInterest}`;
    return await getWithTTL(key, doFetch, 5 * 60 * 1000);
  } catch (err) {
    console.error('Error fetching This Week events:', err);
    return { events: [], lastDoc: null };
  }
}

/**
 * Fetch "Today" events within radius (local day)
 */
export async function fetchTodayEvents(
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

    // Compute local day window
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );

    const startTs = Timestamp.fromDate(startOfDay);
    const endTs = Timestamp.fromDate(endOfDay);

    const doFetch = async () => {
      const promises = bounds.map((b) =>
        db
          .collection('events')
          .where('geohash', '>=', b[0])
          .where('geohash', '<=', b[1])
          .where('interest', '==', selectedInterest)
          .where('status', '==', 'active')
          .where('isDeleted', '==', false)
          .where('date', '>=', startTs)
          .where('date', '<=', endTs)
          .get()
      );

      const snapshots = await Promise.all(promises);

      const matchingDocs = new Map();
      for (const snap of snapshots) {
        for (const doc of snap.docs) {
          const data = doc.data();
          if (data?.isDeleted === true) continue;
          if (
            !data.location ||
            data.location.latitude == null ||
            data.location.longitude == null
          )
            continue;
          const loc = [data.location.latitude, data.location.longitude];
          const distance = distanceBetween(center, loc) * 1000;
          if (distance <= radiusInM && !matchingDocs.has(doc.id)) {
            matchingDocs.set(doc.id, { id: doc.id, ...data });
          }
        }
      }

      const results = Array.from(matchingDocs.values()).sort(
        (a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0)
      );
      return { events: results.slice(0, pageSize), lastDoc: null };
    };

    const key = `today:${center.join(',')}:${radiusInM}:${selectedInterest}`;
    return await getWithTTL(key, doFetch, 5 * 60 * 1000);
  } catch (err) {
    console.error('Error fetching Today events:', err);
    return { events: [], lastDoc: null };
  }
}

/**
 * 📴 Fetch generic upcoming events without personalization (no location or interests)
 */
export async function fetchGenericEvents(pageSize = 20) {
  try {
    const now = getTimestampNow();
    const snap = await db
      .collection('events')
      .where('status', '==', 'active')
      .where('isDeleted', '==', false)
      .where('date', '>=', now)
      .orderBy('date', 'asc')
      .limit(Math.max(5, Math.min(pageSize, 50)))
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Error fetching generic events:', err);
    return [];
  }
}
