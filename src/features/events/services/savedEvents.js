import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../firebase/config';

function coerceTimestamp(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (typeof value?.toDate === 'function') {
    try {
      return Timestamp.fromDate(value.toDate());
    } catch (err) {
      return null;
    }
  }
  if (
    typeof value?.seconds === 'number' &&
    typeof value?.nanoseconds === 'number'
  ) {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if (typeof value?.seconds === 'number') {
    return Timestamp.fromMillis(value.seconds * 1000);
  }
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === 'number') return Timestamp.fromMillis(value);
  return null;
}

function sanitizeMeta(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.slice(0, 120) : undefined;
}

export function listenToSavedEvents(userId, onChange, onError) {
  if (!userId) {
    onChange?.([]);
    return () => {};
  }
  const savedRef = collection(db, 'users', userId, 'savedEvents');
  const q = query(savedRef, orderBy('savedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((snap) => ({
        id: snap.id,
        ...snap.data(),
      }));
      onChange?.(items);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function saveEventForUser({
  userId,
  event,
  eventId,
  surface,
  source,
} = {}) {
  const uid = typeof userId === 'string' ? userId.trim() : '';
  if (!uid) throw new Error('Missing userId for saveEventForUser');

  const targetEventId =
    (typeof event?.id === 'string' && event.id) ||
    (typeof eventId === 'string' && eventId);
  if (!targetEventId)
    throw new Error('Missing eventId for saveEventForUser');

  let eventPayload = event;
  if (!eventPayload || !eventPayload.date) {
    const eventSnap = await getDoc(doc(db, 'events', targetEventId));
    if (!eventSnap.exists()) {
      throw new Error('Event not found');
    }
    eventPayload = { id: eventSnap.id, ...eventSnap.data() };
  }

  const eventStartTs = coerceTimestamp(eventPayload?.date);
  if (!eventStartTs) {
    throw new Error('Event is missing a valid start time');
  }

  const savedDoc = doc(db, 'users', uid, 'savedEvents', targetEventId);
  const payload = {
    eventId: targetEventId,
    savedAt: serverTimestamp(),
    eventStart: eventStartTs,
  };

  const interest = sanitizeMeta(eventPayload?.interest);
  if (interest) payload.interest = interest;
  const category = sanitizeMeta(eventPayload?.category);
  if (category) payload.category = category;

  const cleanedSurface = sanitizeMeta(surface);
  if (cleanedSurface) payload.surface = cleanedSurface;
  const cleanedSource = sanitizeMeta(source);
  if (cleanedSource) payload.source = cleanedSource;

  await setDoc(savedDoc, payload);
  return payload;
}

export async function removeSavedEventForUser({ userId, eventId } = {}) {
  const uid = typeof userId === 'string' ? userId.trim() : '';
  if (!uid) throw new Error('Missing userId for removeSavedEventForUser');
  const targetEventId =
    typeof eventId === 'string' && eventId.trim().length ? eventId.trim() : null;
  if (!targetEventId)
    throw new Error('Missing eventId for removeSavedEventForUser');

  const savedDoc = doc(db, 'users', uid, 'savedEvents', targetEventId);
  await deleteDoc(savedDoc);
}
