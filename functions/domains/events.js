const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { JOIN_CALLABLE_OPTIONS } = require('../shared/config');

const db = admin.firestore();

// Helpers
function buildUserDisplayName(user = {}) {
  if (!user || typeof user !== 'object') return 'Someone';
  if (typeof user.displayName === 'string' && user.displayName.trim()) {
    return user.displayName.trim();
  }
  if (typeof user.name === 'string' && user.name.trim()) {
    return user.name.trim();
  }
  const first = typeof user.firstName === 'string' ? user.firstName.trim() : '';
  const last = typeof user.lastName === 'string' ? user.lastName.trim() : '';
  const combined = [first, last].filter(Boolean).join(' ');
  return combined || 'Someone';
}

function buildSnippetFromUser(uid, user) {
  const first = (user.firstName || '').toString().trim();
  const last = (user.lastName || '').toString().trim();
  const name =
    `${first} ${last}`.trim() || user.displayName || user.username || 'User';
  const photoURL = user.profileImage || user.avatarURL || user.photoURL || null;
  const verified = !!user.verified;
  const rating = typeof user.rating === 'number' ? user.rating : null;
  return { uid, name, photoURL, verified, rating };
}

function getAgeFromDob(dob) {
  try {
    let d = null;
    if (!dob) return null;
    if (dob.toDate) d = dob.toDate();
    else if (typeof dob.seconds === 'number') d = new Date(dob.seconds * 1000);
    else if (dob instanceof Date) d = dob;
    else if (typeof dob === 'string') d = new Date(dob);
    if (!d || isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  } catch {
    return null;
  }
}

// leaveEvent
const leaveEvent = onCall(JOIN_CALLABLE_OPTIONS, async (req) => {
  const auth = req.auth;
  const data = req.data || {};
  const eventId = data.eventId;
  const uid = auth?.uid;

  if (!auth || !uid) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  if (!eventId) {
    throw new HttpsError('invalid-argument', 'Missing eventId');
  }

  const eventRef = db.doc(`events/${eventId}`);
  const chatRef = db.doc(`chats/${eventId}`);
  const userRef = db.doc(`users/${uid}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [evSnap, chatSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(chatRef),
      ]);
      if (!evSnap.exists) throw new HttpsError('not-found', 'Event not found');
      const ev = evSnap.data();

      if (ev.ownerId === uid) {
        throw new HttpsError(
          'failed-precondition',
          'Hosts cannot leave their own event',
        );
      }

      const attendeesArr = Array.isArray(ev.attendees) ? ev.attendees : [];
      const alreadyGone = !attendeesArr.includes(uid);

      const updates = {};
      if (!alreadyGone) {
        updates.attendees = admin.firestore.FieldValue.arrayRemove(uid);
        updates.attendeesCount = admin.firestore.FieldValue.increment(-1);
        updates[`attendeeSnippets.${uid}`] =
          admin.firestore.FieldValue.delete();
        tx.update(eventRef, updates);
      }

      if (chatSnap.exists) {
        tx.update(chatRef, {
          participants: admin.firestore.FieldValue.arrayRemove(uid),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      tx.update(userRef, {
        attendingEvents: admin.firestore.FieldValue.arrayRemove(eventId),
        attendedEvents: admin.firestore.FieldValue.arrayRemove(eventId),
      });

      return { ok: true, removed: !alreadyGone };
    });

    logger.log('[leaveEvent] success', { eventId, uid });
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error('[leaveEvent] error', err?.message || err);
    throw new HttpsError('internal', err?.message || 'Leave event failed');
  }
});

// deleteEvent
const deleteEvent = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
    enforceAppCheck: true,
  },
  async (req) => {
    const auth = req.auth;
    const data = req.data || {};
    const eventId = data.eventId;

    if (!auth || !auth.uid) {
      logger.error('[deleteEvent] unauthenticated');
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    if (!eventId) {
      logger.error('[deleteEvent] missing eventId');
      throw new HttpsError('invalid-argument', 'Missing eventId');
    }

    const eventRef = db.doc(`events/${eventId}`);

    try {
      const result = await db.runTransaction(async (tx) => {
        const evSnap = await tx.get(eventRef);
        if (!evSnap.exists) {
          return { alreadyDeleted: true };
        }
        const ev = evSnap.data();
        const ownerId = ev.ownerId || null;

        const callerUid = auth.uid;
        const isAdmin = !!(
          req.auth &&
          req.auth.token &&
          req.auth.token.admin === true
        );
        if (ownerId !== callerUid && !isAdmin) {
          throw new HttpsError('permission-denied', 'Permission denied');
        }

        if (ev.isDeleted) {
          return { alreadyDeleted: true };
        }

        tx.update(eventRef, {
          isDeleted: true,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (ownerId) {
          const userRef = db.doc(`users/${ownerId}`);
          tx.update(userRef, {
            createdEvents: admin.firestore.FieldValue.arrayRemove(eventId),
          });
        }

        const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
        const notifRef = db.collection('notifications');
        for (const attendeeId of attendees) {
          if (attendeeId !== ownerId) {
            tx.set(notifRef.doc(), {
              type: 'event_cancelled',
              recipientId: attendeeId,
              eventId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              message: `${ev.title || 'Event'} has been cancelled`,
              linkType: 'event',
              linkId: eventId,
              read: false,
            });
          }
        }

        return { success: true };
      });

      logger.log('[deleteEvent] success', { eventId, result });
      return { ok: true, result };
    } catch (err) {
      if (err instanceof HttpsError) {
        logger.error('[deleteEvent] HttpsError', err.code, err.message);
        throw err;
      }
      logger.error('[deleteEvent] error', err?.message || err);
      throw new HttpsError('internal', err?.message || 'Delete event failed');
    }
  },
);

// requestToJoinEvent
const requestToJoinEvent = onCall(JOIN_CALLABLE_OPTIONS, async (req) => {
  const uid = req.auth?.uid;
  const { eventId } = req.data || {};
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required');
  if (!eventId) throw new HttpsError('invalid-argument', 'Missing eventId');

  const eventRef = db.doc(`events/${eventId}`);
  const notifRef = db.collection('notifications');

  try {
    const result = await db.runTransaction(async (tx) => {
      const [evSnap, userSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(db.doc(`users/${uid}`)),
      ]);
      if (!evSnap.exists) throw new HttpsError('not-found', 'Event not found');
      const ev = evSnap.data();
      if (ev.isDeleted === true)
        throw new HttpsError('failed-precondition', 'Event archived');
      if ((ev.privacy || 'public').toLowerCase() !== 'rsvp')
        throw new HttpsError('failed-precondition', 'Event is not RSVP');
      if (ev.ownerId === uid || ev.hostId === uid)
        throw new HttpsError('failed-precondition', 'Host cannot request');

      const userDoc = userSnap.exists ? userSnap.data() : {};
      const userSex = (userDoc.sex || userDoc.gender || '')
        .toString()
        .toLowerCase();
      const privacy = (ev.privacy || 'public').toString().toLowerCase();
      if (privacy === 'female-only' && userSex !== 'female') {
        throw new HttpsError('permission-denied', 'Not eligible (gender)');
      }
      if (privacy === 'male-only' && userSex !== 'male') {
        throw new HttpsError('permission-denied', 'Not eligible (gender)');
      }
      const range = Array.isArray(ev.ageRange) ? ev.ageRange : null;
      if (range && range.length === 2) {
        const [min, max] = range.map((n) =>
          typeof n === 'number' ? n : parseInt(n, 10),
        );
        const age = getAgeFromDob(userDoc.dob);
        if (typeof age === 'number') {
          if (
            (typeof min === 'number' && age < min) ||
            (typeof max === 'number' && age > max)
          ) {
            throw new HttpsError('permission-denied', 'Not eligible (age)');
          }
        }
      }

      const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
      const requests = Array.isArray(ev.requests) ? ev.requests : [];
      if (attendees.includes(uid))
        throw new HttpsError('already-exists', 'Already an attendee');
      if (requests.includes(uid)) return { ok: true, alreadyRequested: true };

      tx.update(eventRef, {
        requests: admin.firestore.FieldValue.arrayUnion(uid),
        waitlistCount: admin.firestore.FieldValue.increment(1),
      });

      const ownerId = ev.ownerId;
      const requesterName = buildUserDisplayName(userDoc);
      if (ownerId) {
        tx.set(notifRef.doc(), {
          type: 'rsvp_request',
          recipientId: ownerId,
          eventId,
          requesterId: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          message: `${requesterName} requested to join your event`,
          linkType: 'event',
          linkId: eventId,
          requesterName,
          read: false,
        });
      }

      return { ok: true };
    });

    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'Request failed');
  }
});

// acceptRsvpRequest
const acceptRsvpRequest = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
    const hostUid = req.auth?.uid;
    const { eventId, userId } = req.data || {};
    if (!hostUid) throw new HttpsError('unauthenticated', 'Auth required');
    if (!eventId || !userId)
      throw new HttpsError('invalid-argument', 'Missing params');

    const eventRef = db.doc(`events/${eventId}`);
    const chatRef = db.doc(`chats/${eventId}`);
    const userRef = db.doc(`users/${userId}`);

    await db.runTransaction(async (tx) => {
      const [evSnap, chatSnap, userSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(chatRef),
        tx.get(userRef),
      ]);
      if (!evSnap.exists) throw new HttpsError('not-found', 'Event missing');
      const ev = evSnap.data();

      const isHost = ev.ownerId === hostUid || ev.hostId === hostUid;
      if (!isHost) throw new HttpsError('permission-denied', 'Not host');
      if (ev.isDeleted === true)
        throw new HttpsError('failed-precondition', 'Event archived');

      const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
      const requests = Array.isArray(ev.requests) ? ev.requests : [];

      const alreadyAttendee = attendees.includes(userId);

      if (
        !alreadyAttendee &&
        typeof ev.capacity === 'number' &&
        ev.capacity > 0 &&
        attendees.length >= ev.capacity
      ) {
        throw new HttpsError('failed-precondition', 'Event full');
      }

      const updates = {};
      if (!alreadyAttendee) {
        updates.attendees = admin.firestore.FieldValue.arrayUnion(userId);
        updates.attendeesCount = admin.firestore.FieldValue.increment(1);
        const snippet = userSnap.exists
          ? buildSnippetFromUser(userId, userSnap.data())
          : {
              uid: userId,
              name: 'User',
              photoURL: null,
              verified: false,
              rating: null,
            };
        updates[`attendeeSnippets.${userId}`] = snippet;
      }
      if (requests.includes(userId)) {
        updates.requests = admin.firestore.FieldValue.arrayRemove(userId);
        updates.waitlistCount = admin.firestore.FieldValue.increment(-1);
      }
      if (Object.keys(updates).length) tx.update(eventRef, updates);

      if (!chatSnap.exists) {
        tx.set(chatRef, {
          eventId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: hostUid,
          participants: Array.from(
            new Set([hostUid, userId, ev.ownerId].filter(Boolean)),
          ),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          messageCount: 0,
          isArchived: false,
        });
      } else {
        tx.update(chatRef, {
          participants: admin.firestore.FieldValue.arrayUnion(userId, hostUid),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      tx.update(userRef, {
        attendingEvents: admin.firestore.FieldValue.arrayUnion(eventId),
      });
    });

    try {
      await db.collection('notifications').add({
        type: 'request_accepted',
        recipientId: userId,
        eventId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        linkType: 'event',
        linkId: eventId,
        message: 'Your RSVP request was accepted!',
        read: false,
      });
    } catch (e) {
      logger.error('[acceptRsvpRequest] notify error', e?.message || e);
    }

    try {
      const eventSnap = await eventRef.get();
      const eventData = eventSnap.data();
      const userSnap = await userRef.get();
      const userData = userSnap.exists ? userSnap.data() : {};
      const userName = buildUserDisplayName(userData);

      await db.collection('notifications').add({
        type: 'event_joined',
        recipientId: hostUid,
        eventId,
        userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        linkType: 'event',
        linkId: eventId,
        message: `${userName} joined ${eventData?.title || 'your event'}`,
        userName,
        read: false,
      });
    } catch (e) {
      logger.error(
        '[acceptRsvpRequest] event_joined notify error',
        e?.message || e,
      );
    }

    try {
      const q = await db
        .collection('notifications')
        .where('type', '==', 'rsvp_request')
        .where('recipientId', '==', hostUid)
        .where('eventId', '==', eventId)
        .where('requesterId', '==', userId)
        .limit(10)
        .get();
      const batch = db.batch();
      q.docs.forEach((d) =>
        batch.update(d.ref, {
          status: 'handled',
          readAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      );
      if (q.docs.length) await batch.commit();
    } catch (e) {
      logger.error('[acceptRsvpRequest] mark handled error', e?.message || e);
    }

    return { ok: true };
  },
);

// declineRsvpRequest
const declineRsvpRequest = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
    const hostUid = req.auth?.uid;
    const { eventId, userId } = req.data || {};
    if (!hostUid) throw new HttpsError('unauthenticated', 'Auth required');
    if (!eventId || !userId)
      throw new HttpsError('invalid-argument', 'Missing params');

    const eventRef = db.doc(`events/${eventId}`);

    await db.runTransaction(async (tx) => {
      const evSnap = await tx.get(eventRef);
      if (!evSnap.exists) throw new HttpsError('not-found', 'Event missing');
      const ev = evSnap.data();
      const isHost = ev.ownerId === hostUid || ev.hostId === hostUid;
      if (!isHost) throw new HttpsError('permission-denied', 'Not host');
      if (ev.isDeleted === true)
        throw new HttpsError('failed-precondition', 'Event archived');

      const requests = Array.isArray(ev.requests) ? ev.requests : [];
      if (requests.includes(userId)) {
        tx.update(eventRef, {
          requests: admin.firestore.FieldValue.arrayRemove(userId),
          waitlistCount: admin.firestore.FieldValue.increment(-1),
        });
      }
    });

    return { ok: true };
  },
);

module.exports = {
  leaveEvent,
  deleteEvent,
  requestToJoinEvent,
  acceptRsvpRequest,
  declineRsvpRequest,
};

