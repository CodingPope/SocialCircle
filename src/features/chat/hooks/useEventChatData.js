import { useEffect, useState, useRef, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  getDoc,
  updateDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  serverTimestamp,
  getDocs,
  where,
  Timestamp,
} from '../../../services/firebase/firestoreCompat';
import { db, functions, auth, sendNotification, deleteEvent } from '../../../services/firebase';
import { geohashForLocation } from 'geofire-common';
import { track as trackClient, trackReportContent } from '../../../lib/analytics';
import { shareEventDetails } from '../../events/utils/shareUtils';
import { addSocialCircleEventToCalendar } from '../../../services/calendarService';
import { canSendMessage, showTOSRequiredAlert } from '../../../utils/tosHelper';
import { useUserStore } from '../../profile';
import joinEvent from '../../events/api/joinEventService';
import { getEditDateBounds, coerceDateWithinBounds } from './dateBounds';

const emptyArr = [];
const mapSnippetsToAttendees = (snippets) => {
  const arr = Array.isArray(snippets)
    ? snippets
    : Object.values(snippets || {});
  return arr
    .filter((s) => s && s.uid)
    .map((s) => ({
      id: s.uid,
      displayName: s.name || 'User',
      photoURL: s.photoURL || null,
      rating: typeof s.rating === 'number' ? s.rating : null,
    }));
};

export function useEventChatData({ eventId, joinIntent, joinGraceDurationMs }) {
  const user = useUserStore((s) => s.user);
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState(emptyArr);
  const [messages, setMessages] = useState(emptyArr);
  const [hostUser, setHostUser] = useState(null);
  const [requesters, setRequesters] = useState(emptyArr);
  const [requesterIds, setRequesterIds] = useState(emptyArr);
  const [pinned, setPinned] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joinGraceActive, setJoinGraceActive] = useState(() => !!joinIntent);
  const eventUnsubRef = useRef(null);
  const messagesUnsubRef = useRef(null);
  const joinGraceTimerRef = useRef(null);

  // Event listener (data + attendees + host + pinned/requesters)
  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    const eventRef = db.collection('events').doc(eventId);
    const unsub = eventRef.onSnapshot(async (snap) => {
      if (!snap.exists) {
        setEvent(null);
        setLoading(false);
        return;
      }
      const data = snap.data();
      setEvent({ id: snap.id, ...data });
      // Hydrate attendees (snippets -> full objects, ids -> fetched)
      (async () => {
        try {
          if (
            data?.attendeeSnippets &&
            (Array.isArray(data.attendeeSnippets) ||
              typeof data.attendeeSnippets === 'object')
          ) {
            setAttendees(mapSnippetsToAttendees(data.attendeeSnippets));
          } else if (Array.isArray(data?.attendees) && data.attendees.length) {
            // Batch fetch minimal fields for attendee ids
            const uids = data.attendees.slice(0, 50); // hard cap to avoid huge fan-out
            const chunks = [];
            for (let i = 0; i < uids.length; i += 10) {
              chunks.push(uids.slice(i, i + 10));
            }
            const results = [];
            for (const chunk of chunks) {
              try {
                const q = query(
                  collection(db, 'users'),
                  where('__name__', 'in', chunk),
                );
                const snapUsers = await getDocs(q);
                snapUsers.docs.forEach((d) => {
                  const u = d.data() || {};
                  results.push({
                    id: d.id,
                    displayName:
                      u.displayName ||
                      `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
                      'User',
                    photoURL: u.photoURL || u.profileImage || u.avatarURL || null,
                    rating:
                      typeof u.rating === 'number'
                        ? u.rating
                        : typeof u.ranking === 'number'
                        ? u.ranking
                        : null,
                  });
                });
              } catch (e) {
                // fallback to per-doc fetch for this chunk
                const individuals = await Promise.all(
                  chunk.map(async (uid) => {
                    try {
                      const userSnap = await getDoc(doc(db, 'users', uid));
                      const u = userSnap.exists ? userSnap.data() : {};
                      return {
                        id: uid,
                        displayName:
                          u.displayName ||
                          `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
                          'User',
                        photoURL:
                          u.photoURL || u.profileImage || u.avatarURL || null,
                        rating:
                          typeof u.rating === 'number'
                            ? u.rating
                            : typeof u.ranking === 'number'
                            ? u.ranking
                            : null,
                      };
                    } catch {
                      return {
                        id: uid,
                        displayName: 'User',
                        photoURL: null,
                        rating: null,
                      };
                    }
                  }),
                );
                results.push(...individuals);
              }
            }
            setAttendees(results);
          } else {
            setAttendees(emptyArr);
          }
        } catch {
          setAttendees(emptyArr);
        }
      })();

      setRequesterIds(
        data.requesters || data.requests || data.pending || emptyArr,
      );
      setPinned(data.pinnedMessage || null);

      if (data.ownerId) {
        try {
          const hostSnap = await db.collection('users').doc(data.ownerId).get();
          if (hostSnap.exists) setHostUser({ id: hostSnap.id, ...hostSnap.data() });
        } catch {}
      }
      setLoading(false);
    });
    eventUnsubRef.current = unsub;
    return () => {
      unsub && unsub();
      eventUnsubRef.current = null;
    };
  }, [eventId]);

  // Messages listener
  useEffect(() => {
    if (!eventId) return;
    const messagesRef = db.collection('chats').doc(eventId).collection('messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(next);
      },
      (err) => setError(err),
    );
    messagesUnsubRef.current = unsub;
    return () => {
      unsub && unsub();
      messagesUnsubRef.current = null;
    };
  }, [eventId]);

  // Chat doc listener for pinned announcements (chat-level)
  useEffect(() => {
    if (!eventId) return;
    const chatDocRef = doc(db, 'chats', eventId);
    const unsub = onSnapshot(
      chatDocRef,
      (snap) => {
        if (!snap.exists) {
          setPinned(null);
          return;
        }
        const data = snap.data() || {};
        setPinned(data.pinned || data.pinnedMessage || null);
      },
      () => setPinned(null),
    );
    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [eventId]);

  // Join grace timer
  useEffect(() => {
    if (joinGraceActive) {
      joinGraceTimerRef.current = setTimeout(
        () => setJoinGraceActive(false),
        Math.max(0, joinGraceDurationMs ?? 8000),
      );
    }
    return () => {
      if (joinGraceTimerRef.current) clearTimeout(joinGraceTimerRef.current);
    };
  }, [joinGraceActive, joinGraceDurationMs]);

  const leaveEvent = useCallback(async () => {
    if (!eventId || !user?.uid) return;
    const batch = writeBatch(db);
    const eventRef = db.collection('events').doc(eventId);
    batch.update(eventRef, {
      attendees: arrayRemove(user.uid),
      attendeeCount: (event?.attendeeCount || 1) - 1,
    });
    batch.update(db.collection('users').doc(user.uid), {
      joinedEvents: arrayRemove(eventId),
    });
    await batch.commit();
  }, [eventId, user?.uid, event?.attendeeCount]);

  const joinEventHandler = useCallback(async () => {
    if (!eventId || !user?.uid) return;
    if (!canSendMessage(user)) {
      showTOSRequiredAlert();
      return;
    }
    await joinEvent(eventId, user, { joinIntent: true });
    setJoinGraceActive(true);
  }, [eventId, user]);

  const sendMessage = useCallback(
    async (text, extra = {}) => {
      if (!text || !eventId || !user?.uid) return;
      const messagesRef = db.collection('chats').doc(eventId).collection('messages');
      await addDoc(messagesRef, {
        text,
        userId: user.uid,
        createdAt: serverTimestamp(),
        ...extra,
      });
      trackClient('chat_send', { event_id: eventId });
    },
    [eventId, user?.uid],
  );

  const pinMessage = useCallback(
    async (messageId, text) => {
      if (!eventId) return;
      await db.collection('events').doc(eventId).set(
        {
          pinnedMessage: { messageId, text, updatedAt: serverTimestamp() },
        },
        { merge: true },
      );
    },
    [eventId],
  );

  const unpinMessage = useCallback(async () => {
    if (!eventId) return;
    await db.collection('events').doc(eventId).set({ pinnedMessage: null }, { merge: true });
  }, [eventId]);

  const editEvent = useCallback(
    async ({ title, description, date, location, locationCoords }) => {
      if (!eventId) return;
      const eventRef = db.collection('events').doc(eventId);
      const updates = {};
      if (title) updates.title = title;
      if (description) updates.description = description;
      if (date) updates.date = Timestamp.fromDate(coerceDateWithinBounds(date));
      if (location) updates.locationName = location;
      if (locationCoords?.lat && locationCoords?.lng) {
        updates.location = {
          latitude: locationCoords.lat,
          longitude: locationCoords.lng,
        };
        updates.geohash = geohashForLocation([locationCoords.lat, locationCoords.lng]);
      }
      await eventRef.set(updates, { merge: true });
    },
    [eventId],
  );

  const reportMessage = useCallback(
    async ({ messageId, reason }) => {
      if (!eventId || !messageId || !user?.uid) return;
      const callable = functions.httpsCallable('reportContent');
      await callable({
        type: 'message',
        contentId: messageId,
        eventId,
        reason,
      });
      trackReportContent({ content_type: 'message', content_id: messageId });
    },
    [eventId, user?.uid],
  );

  const addToCalendar = useCallback(async () => {
    if (!event) return;
    await addSocialCircleEventToCalendar(event);
  }, [event]);

  const shareEvent = useCallback(async () => {
    if (!event) return;
    await shareEventDetails(event);
  }, [event]);

  const toggleSaveEvent = useCallback(async () => {
    if (!event || !user?.uid) return;
    const eventRef = db.collection('events').doc(event.id);
    const saved = event.savedBy?.includes(user.uid);
    await eventRef.update({
      savedBy: saved ? arrayRemove(user.uid) : arrayUnion(user.uid),
      savedCount: saved
        ? (event.savedCount || 1) - 1
        : (event.savedCount || 0) + 1,
    });
    setEvent((prev) =>
      prev
        ? {
            ...prev,
            savedBy: saved
              ? prev.savedBy.filter((id) => id !== user.uid)
              : [...(prev.savedBy || []), user.uid],
            savedCount: saved
              ? (prev.savedCount || 1) - 1
              : (prev.savedCount || 0) + 1,
          }
        : prev,
    );
  }, [event, user?.uid]);

  const deleteEventSoft = useCallback(async () => {
    if (!eventId) return;
    await deleteEvent(eventId);
  }, [eventId]);

  useEffect(() => {
    return () => {
      eventUnsubRef.current?.();
      messagesUnsubRef.current?.();
      if (joinGraceTimerRef.current) clearTimeout(joinGraceTimerRef.current);
    };
  }, []);

  // Hydrate requester details (avatars/names) when ids change
  useEffect(() => {
    const hydrate = async () => {
      if (!Array.isArray(requesterIds) || !requesterIds.length) {
        setRequesters(emptyArr);
        return;
      }
      const chunks = [];
      for (let i = 0; i < requesterIds.length; i += 10) {
        chunks.push(requesterIds.slice(i, i + 10));
      }
      const results = [];
      for (const chunk of chunks) {
        try {
          const q = query(collection(db, 'users'), where('__name__', 'in', chunk));
          const snap = await getDocs(q);
          snap.docs.forEach((d) => {
            const u = d.data() || {};
            results.push({
              id: d.id,
              displayName:
                u.displayName ||
                `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
                'User',
              photoURL: u.photoURL || u.profileImage || u.avatarURL || null,
              rating:
                typeof u.rating === 'number'
                  ? u.rating
                  : typeof u.ranking === 'number'
                  ? u.ranking
                  : null,
            });
          });
        } catch (err) {
          // fallback: fetch per user
          const resolved = await Promise.all(
            chunk.map(async (uid) => {
              try {
                const snapUser = await getDoc(doc(db, 'users', uid));
                const data = snapUser.exists ? snapUser.data() : {};
                return {
                  id: uid,
                  displayName:
                    data.displayName ||
                    `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
                    'User',
                  photoURL:
                    data.photoURL || data.profileImage || data.avatarURL || null,
                  rating:
                    typeof data.rating === 'number'
                      ? data.rating
                      : typeof data.ranking === 'number'
                      ? data.ranking
                      : null,
                };
              } catch {
                return { id: uid, displayName: 'User', photoURL: null, rating: null };
              }
            }),
          );
          results.push(...resolved);
        }
      }
      setRequesters(results);
    };
    hydrate();
  }, [requesterIds]);

  return {
    user,
    event,
    attendees,
    messages,
    hostUser,
    requesters,
    pinned,
    loading,
    error,
    joinGraceActive,
    setJoinGraceActive,
    leaveEvent,
    joinEventHandler,
    sendMessage,
    pinMessage,
    unpinMessage,
    editEvent,
    reportMessage,
    addToCalendar,
    shareEvent,
    toggleSaveEvent,
    deleteEventSoft,
    setEvent,
    setPinned,
    setRequesters,
    setAttendees,
  };
}
