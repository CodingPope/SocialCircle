// At top of functions/index.js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const {
  onDocumentUpdated,
  onDocumentCreated,
} = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore(); // convenience

// -------------------- EXISTING FUNCTIONS (unchanged) --------------------

// Callable function to re-enable a disabled Auth user (for account reactivation)
exports.enableAuthUser = onCall(async (req) => {
  const { uid } = req.data;
  if (!uid) throw new HttpsError('invalid-argument', 'Missing uid');
  await admin.auth().updateUser(uid, { disabled: false });
  return { success: true };
});

// Description: Sync Firebase Auth user disabled state with Firestore isDeleted field
exports.syncAuthWithSoftDelete = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before.isDeleted && after.isDeleted) {
      await admin.auth().updateUser(event.params.userId, { disabled: true });
    }
    if (before.isDeleted && !after.isDeleted) {
      await admin.auth().updateUser(event.params.userId, { disabled: false });
    }
  }
);

exports.getEvents = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    cpu: 1,
    timeoutSeconds: 60,
  },
  async (req) => {
    logger.log('🔥 getEvents called; auth=', req.auth?.uid ?? 'none');
    const snap = await db.collection('events').get();
    return { events: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }
);

// -------------------- NEW: EXPO PUSH SUPPORT --------------------

// Helper: chunk an array into batches of size n (Expo recommends <= 100 per request)
function chunk(arr, size = 100) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Send messages to Expo Push API
async function sendExpoPushMessages(messages) {
  const chunks = chunk(messages, 100);
  for (const batch of chunks) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error('[push] Expo API error', res.status, text);
      continue;
    }

    const json = await res.json().catch(() => ({}));
    const tickets = json?.data || [];
    const hasErrors = tickets.some((t) => t.status === 'error');
    if (hasErrors) logger.error('[push] Expo ticket errors', tickets);
  }
}

// Callable: send a push to a specific userId or directly to a list of Expo tokens
// data: { userId?, tokens?, title, body, data? }
exports.sendPush = onCall(async (req) => {
  const { userId, tokens, title, body, data } = req.data || {};
  if (!title || !body)
    throw new HttpsError('invalid-argument', 'Missing title/body');

  let expoTokens = Array.isArray(tokens) ? tokens.slice() : [];

  if (userId) {
    const snap = await db.doc(`users/${userId}`).get();
    if (snap.exists) {
      const t = snap.get('deviceToken');
      if (t) expoTokens.push(t);
    }
  }

  // dedupe + basic validation (Expo tokens start with "ExponentPushToken")
  expoTokens = Array.from(new Set(expoTokens)).filter(
    (t) => typeof t === 'string' && t.startsWith('ExponentPushToken')
  );

  if (expoTokens.length === 0) {
    logger.log('[push] No valid Expo tokens to send.');
    return { ok: true, sent: 0 };
  }

  const messages = expoTokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: data || {},
  }));

  await sendExpoPushMessages(messages);
  logger.log(`[push] Sent ${expoTokens.length} notifications`);
  return { ok: true, sent: expoTokens.length };
});

// Trigger: on new chat message, notify all attendees + host (except the sender)
// Also stamps events/{eventId}.lastMessageAt for feed sorting
exports.onMessageCreateNotify = onDocumentCreated(
  'chats/{eventId}/messages/{messageId}',
  async (event) => {
    const { eventId } = event.params;
    const message = event.data?.data();
    if (!message) return;

    // 1) Update lastMessageAt on the event (non-blocking)
    try {
      await db
        .doc(`events/${eventId}`)
        .set(
          { lastMessageAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
    } catch (e) {
      logger.error('[push] Failed to update lastMessageAt', e?.message || e);
    }

    // 2) Load event to determine target users
    const evSnap = await db.doc(`events/${eventId}`).get();
    if (!evSnap.exists) return;

    const ev = evSnap.data() || {};
    const hostId = ev.ownerId;
    const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
    const senderId = message.senderId;

    const targetUids = new Set(
      [...attendees, hostId].filter((uid) => uid && uid !== senderId)
    );
    if (targetUids.size === 0) return;

    // 3) Fetch tokens
    const userRefs = [...targetUids].map((uid) => db.doc(`users/${uid}`));
    const userSnaps = await db.getAll(...userRefs);
    const expoTokens = userSnaps
      .map((s) => {
        if (!s.exists) return null;
        const t = s.get('deviceToken');
        const optIn = s.get('pushOptIn');
        if (optIn === false) return null; // respect in-app opt-out
        return t;
      })
      .filter(
        (t) => typeof t === 'string' && t.startsWith('ExponentPushToken')
      );

    if (expoTokens.length === 0) {
      logger.log('[push] No tokens to notify for event', eventId);
      return;
    }

    // 4) Build and send
    const title = ev.title || 'New message';
    const body =
      typeof message.text === 'string' && message.text.trim().length
        ? message.text.trim()
        : 'You have a new message';
    const data = { eventId };

    const messages = expoTokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data,
    }));
    await sendExpoPushMessages(messages);
    logger.log(
      `[push] Notified ${expoTokens.length} users for event ${eventId}`
    );
  }
);

// NEW: Trigger push when a notification document is created
exports.onNotificationCreatedPush = onDocumentCreated(
  'notifications/{id}',
  async (event) => {
    try {
      const notif = event.data?.data();
      if (!notif) return;
      if (notif.isDeleted === true) return;

      const recipientId = notif.recipientId;
      if (!recipientId) return;

      // Idempotency: skip if push already sent (best-effort)
      const ref = db.doc(`notifications/${event.params.id}`);
      const snap = await ref.get();
      if (snap.exists && snap.get('pushSentAt')) return;

      // Fetch recipient token + opt-in
      const userSnap = await db.doc(`users/${recipientId}`).get();
      if (!userSnap.exists) return;
      const token = userSnap.get('deviceToken');
      const optIn = userSnap.get('pushOptIn');
      const canPush =
        !!token &&
        token.startsWith('ExponentPushToken') &&
        (optIn === undefined || optIn === true);
      if (!canPush) return;

      // Build title/body based on notification type
      let title = 'Social Circle';
      let body = 'You have a new notification';
      switch (notif.type) {
        case 'rsvp_request':
          title = 'RSVP Request';
          body = 'Someone requested to join your event';
          break;
        case 'request_accepted':
          title = 'Request Accepted';
          body = 'Your RSVP request was accepted!';
          break;
        case 'chat':
          title = 'New message';
          body =
            typeof notif.message === 'string' && notif.message.trim().length
              ? notif.message.trim()
              : 'You have a new message';
          break;
        default:
          if (typeof notif.title === 'string' && notif.title.trim().length) {
            title = notif.title.trim();
          }
          if (
            typeof notif.message === 'string' &&
            notif.message.trim().length
          ) {
            body = notif.message.trim();
          }
      }

      const data = {
        notificationId: event.params.id,
        type: notif.type || 'default',
        linkType: notif.linkType || null,
        linkId: notif.linkId || null,
        eventId: notif.eventId || null,
      };

      await sendExpoPushMessages([
        { to: token, sound: 'default', title, body, data },
      ]);

      // Mark pushed (best-effort)
      await ref.set(
        { pushSentAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (e) {
      logger.error('[push] onNotificationCreatedPush error', e?.message || e);
    }
  }
);

// Callable: RSVP to event — creates chat doc (id == eventId) on first RSVP and ensures participants list
exports.rsvpEvent = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
    const auth = req.auth;
    const data = req.data || {};
    const eventId = data.eventId;
    const userId = data.userId;

    if (!auth || !auth.uid) {
      logger.error('[rsvpEvent] unauthenticated call');
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    if (!eventId || !userId) {
      logger.error('[rsvpEvent] missing params', { eventId, userId });
      throw new HttpsError('invalid-argument', 'Missing parameters');
    }

    const eventRef = db.doc(`events/${eventId}`);
    const chatRef = db.doc(`chats/${eventId}`);

    try {
      // Use transaction for idempotent updates; READS must be before WRITES
      const result = await db.runTransaction(async (tx) => {
        // READS
        const [evSnap, chatSnap] = await Promise.all([
          tx.get(eventRef),
          tx.get(chatRef),
        ]);
        if (!evSnap.exists)
          throw new HttpsError('not-found', 'Event does not exist');
        const ev = evSnap.data();
        const ownerId = ev.ownerId || null;

        // Capacity check (optional safety)
        const attendeesArr = Array.isArray(ev.attendees) ? ev.attendees : [];
        if (
          typeof ev.capacity === 'number' &&
          ev.capacity > 0 &&
          attendeesArr.length >= ev.capacity &&
          !attendeesArr.includes(userId)
        ) {
          throw new HttpsError(
            'failed-precondition',
            'Event is full. Join the waitlist if available.'
          );
        }

        // Compute participants union (owner + attendees + user)
        const participants = new Set(attendeesArr);
        if (ownerId) participants.add(ownerId);
        participants.add(userId);
        const participantsArray = Array.from(participants);

        // WRITES
        if (!attendeesArr.includes(userId)) {
          tx.update(eventRef, {
            attendees: admin.firestore.FieldValue.arrayUnion(userId),
          });
        }

        if (!chatSnap.exists) {
          tx.set(chatRef, {
            eventId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: ownerId || auth.uid,
            participants: participantsArray,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            messageCount: 0,
            isArchived: false,
          });
        } else {
          tx.update(chatRef, {
            participants: admin.firestore.FieldValue.arrayUnion(
              ...participantsArray
            ),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // Optionally also maintain a mirror field on user doc in the same transaction
        const userRef = db.doc(`users/${userId}`);
        tx.update(userRef, {
          attendingEvents: admin.firestore.FieldValue.arrayUnion(eventId),
        });

        return { chatId: eventId, participants: participantsArray };
      });

      logger.log('[rsvpEvent] success', { eventId, userId });
      return result;
    } catch (err) {
      if (err instanceof HttpsError) {
        logger.error('[rsvpEvent] HttpsError', err.code, err.message);
        throw err;
      }
      logger.error('[rsvpEvent] error', err?.message || err);
      throw new HttpsError('internal', err?.message || 'RSVP failed');
    }
  }
);

// Callable: allow a signed-in attendee to leave an event (removes from attendees, updates user arrays, prunes chat participants)
exports.leaveEvent = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
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
        // READS first
        const [evSnap, chatSnap] = await Promise.all([
          tx.get(eventRef),
          tx.get(chatRef),
        ]);
        if (!evSnap.exists)
          throw new HttpsError('not-found', 'Event not found');
        const ev = evSnap.data();

        // Host cannot leave via this API
        if (ev.ownerId === uid) {
          throw new HttpsError(
            'failed-precondition',
            'Hosts cannot leave their own event'
          );
        }

        const attendeesArr = Array.isArray(ev.attendees) ? ev.attendees : [];
        const alreadyGone = !attendeesArr.includes(uid);

        // WRITES
        if (!alreadyGone) {
          tx.update(eventRef, {
            attendees: admin.firestore.FieldValue.arrayRemove(uid),
          });
        }

        // Update chat participants (if chat exists)
        if (chatSnap.exists) {
          tx.update(chatRef, {
            participants: admin.firestore.FieldValue.arrayRemove(uid),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // Update user mirrors (best-effort; presence not required)
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
  }
);

// Callable: delete (soft) an event — runs with admin privileges to avoid client rule issues
exports.deleteEvent = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
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
          // If event doc is already gone, treat as idempotent success
          return { alreadyDeleted: true };
        }
        const ev = evSnap.data();
        const ownerId = ev.ownerId || null;

        // Only allow the event owner or admins (custom claim) to soft-delete via this callable
        const callerUid = auth.uid;
        const isAdmin = !!(
          req.auth &&
          req.auth.token &&
          req.auth.token.admin === true
        );
        if (ownerId !== callerUid && !isAdmin) {
          throw new HttpsError('permission-denied', 'Permission denied');
        }

        // Idempotent: if already soft-deleted, just return existing state
        if (ev.isDeleted) {
          return { alreadyDeleted: true };
        }

        // Perform batch via transaction updates
        tx.update(eventRef, {
          isDeleted: true,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (ownerId) {
          const userRef = db.doc(`users/${ownerId}`);
          tx.update(userRef, {
            createdEvents: admin.firestore.FieldValue.arrayRemove(eventId),
            // keep legacy attending/attended cleanup out of scope
          });
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
      // Surface a friendly message to the client
      throw new HttpsError('internal', err?.message || 'Delete event failed');
    }
  }
);

// Callable: request to join an RSVP event (adds caller to requests, notifies host)
exports.requestToJoinEvent = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
    const uid = req.auth?.uid;
    const { eventId } = req.data || {};
    if (!uid)
      throw new HttpsError('unauthenticated', 'Authentication required');
    if (!eventId) throw new HttpsError('invalid-argument', 'Missing eventId');

    const eventRef = db.doc(`events/${eventId}`);
    const notifRef = db.collection('notifications');

    try {
      const result = await db.runTransaction(async (tx) => {
        const evSnap = await tx.get(eventRef);
        if (!evSnap.exists)
          throw new HttpsError('not-found', 'Event not found');
        const ev = evSnap.data();

        if (ev.isDeleted === true)
          throw new HttpsError('failed-precondition', 'Event archived');
        if (ev.privacy !== 'rsvp')
          throw new HttpsError('failed-precondition', 'Event is not RSVP');
        if (ev.ownerId === uid || ev.hostId === uid)
          throw new HttpsError('failed-precondition', 'Host cannot request');

        const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
        const requests = Array.isArray(ev.requests) ? ev.requests : [];
        if (attendees.includes(uid))
          throw new HttpsError('already-exists', 'Already an attendee');
        if (requests.includes(uid)) return { ok: true, alreadyRequested: true }; // idempotent

        tx.update(eventRef, {
          requests: admin.firestore.FieldValue.arrayUnion(uid),
        });

        // Create notification to host (best-effort)
        const ownerId = ev.ownerId;
        if (ownerId) {
          tx.set(notifRef.doc(), {
            type: 'rsvp_request',
            recipientId: ownerId,
            eventId,
            requesterId: uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            message: 'New RSVP request',
            linkType: 'event',
            linkId: eventId,
            read: false,
          });
        }

        return { ok: true };
      });

      return result;
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('[requestToJoinEvent] error', err?.message || err);
      throw new HttpsError('internal', err?.message || 'Request failed');
    }
  }
);

// Callable: host accepts an RSVP request
exports.acceptRsvpRequest = onCall(
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
      const [evSnap, chatSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(chatRef),
      ]);
      if (!evSnap.exists) throw new HttpsError('not-found', 'Event missing');
      const ev = evSnap.data();

      const isHost = ev.ownerId === hostUid || ev.hostId === hostUid;
      if (!isHost) throw new HttpsError('permission-denied', 'Not host');
      if (ev.isDeleted === true)
        throw new HttpsError('failed-precondition', 'Event archived');

      const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
      const requests = Array.isArray(ev.requests) ? ev.requests : [];

      // If already attendee, just ensure requests cleaned up
      const alreadyAttendee = attendees.includes(userId);

      // Capacity check if needed
      if (
        !alreadyAttendee &&
        typeof ev.capacity === 'number' &&
        ev.capacity > 0 &&
        attendees.length >= ev.capacity
      ) {
        throw new HttpsError('failed-precondition', 'Event full');
      }

      // Update event arrays
      if (!alreadyAttendee) {
        tx.update(eventRef, {
          attendees: admin.firestore.FieldValue.arrayUnion(userId),
          requests: requests.includes(userId)
            ? admin.firestore.FieldValue.arrayRemove(userId)
            : admin.firestore.FieldValue.arrayUnion(), // no-op
        });
      } else if (requests.includes(userId)) {
        tx.update(eventRef, {
          requests: admin.firestore.FieldValue.arrayRemove(userId),
        });
      }

      // Chat participants
      if (!chatSnap.exists) {
        tx.set(chatRef, {
          eventId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: hostUid,
          participants: Array.from(
            new Set([hostUid, userId, ev.ownerId].filter(Boolean))
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

      // Mirror onto user
      tx.update(userRef, {
        attendingEvents: admin.firestore.FieldValue.arrayUnion(eventId),
      });
    });

    // Create acceptance notification (best-effort outside transaction)
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

    // Mark host's rsvp_request notification as handled/read (best-effort)
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
        })
      );
      if (q.docs.length) await batch.commit();
    } catch (e) {
      logger.error('[acceptRsvpRequest] mark handled error', e?.message || e);
    }

    return { ok: true };
  }
);

// Callable: host declines an RSVP request
exports.declineRsvpRequest = onCall(
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
        });
      }
    });

    // No notification for decline (product decision)
    return { ok: true };
  }
);

// Callable: create a report (server-side write to /reports)
exports.createReport = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
      throw new HttpsError('unauthenticated', 'Authentication required');

    const data = req.data || {};
    const type = data.type;
    const targetId = data.targetId;
    const reason =
      (data.reason || '').toString().trim() || 'No reason provided';
    const details = data.details ? String(data.details).slice(0, 2000) : null;
    const context =
      typeof data.context === 'object' && data.context !== null
        ? data.context
        : {};

    if (!['event', 'user'].includes(type))
      throw new HttpsError('invalid-argument', 'Invalid type');
    if (!targetId || typeof targetId !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetId');

    // Sanitize evidence array (optional list of strings/URLs)
    let evidence = [];
    if (Array.isArray(data.evidence)) {
      evidence = data.evidence
        .filter((e) => typeof e === 'string')
        .slice(0, 10)
        .map((e) => e.slice(0, 1000));
    }

    const reportDoc = {
      type, // 'event' | 'user'
      targetId,
      reporterId: uid, // authoritative source
      reason,
      details: details || null,
      status: 'pending',
      evidence,
      context: {
        eventId: typeof context.eventId === 'string' ? context.eventId : null,
        messageId:
          typeof context.messageId === 'string' ? context.messageId : null,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      const ref = await db.collection('reports').add(reportDoc);
      logger.log('[createReport] created', ref.id, { type, targetId, uid });
      return { ok: true, id: ref.id };
    } catch (err) {
      logger.error('[createReport] error', err?.message || err);
      throw new HttpsError('internal', 'Failed to create report');
    }
  }
);
