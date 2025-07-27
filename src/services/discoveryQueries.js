// src/services/discoveryQueries.js

import { db } from '../firebase/config';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';

/**
 * Fetch "Hot" events: sorted by attendee count (MVP FOMO scoring later)
 * @param {string[]} interests - user interests
 * @param {string} city - user's base city
 */
export async function fetchHotEvents(interests, city) {
  try {
    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('city', '==', city),
      where('interests', 'array-contains-any', interests),
      orderBy('attendeesCount', 'desc'),
      limit(20)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (err) {
    console.error('Error fetching Hot events:', err);
    return [];
  }
}

/**
 * Fetch "New" events: most recently created
 */
export async function fetchNewEvents(interests, city) {
  try {
    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('city', '==', city),
      where('interests', 'array-contains-any', interests),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (err) {
    console.error('Error fetching New events:', err);
    return [];
  }
}

/**
 * Fetch "Today" events: happening today only
 */
export async function fetchTodayEvents(interests, city) {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('city', '==', city),
      where('interests', 'array-contains-any', interests),
      where('startAt', '>=', startOfDay),
      where('startAt', '<=', endOfDay),
      orderBy('startAt', 'asc'),
      limit(20)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (err) {
    console.error('Error fetching Today events:', err);
    return [];
  }
}

/**
 * Fetch "This Week" events: happening within the next 7 days
 */
export async function fetchThisWeekEvents(interests, city) {
  try {
    const now = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(now.getDate() + 7);

    const eventsRef = collection(db, 'events');
    const q = query(
      eventsRef,
      where('city', '==', city),
      where('interests', 'array-contains-any', interests),
      where('startAt', '>=', now),
      where('startAt', '<=', weekFromNow),
      orderBy('startAt', 'asc'),
      limit(20)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (err) {
    console.error('Error fetching This Week events:', err);
    return [];
  }
}
