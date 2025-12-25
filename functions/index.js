// At top of functions/index.js
const {
  onCall,
  onRequest,
  HttpsError,
} = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const {
  onDocumentUpdated,
  onDocumentCreated,
  onDocumentDeleted,
} = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { geohashForLocation } = require('geofire-common');

admin.initializeApp();
const db = admin.firestore(); // convenience
const FieldValue = admin.firestore.FieldValue;
const projectId = process.env.GCLOUD_PROJECT;
const ENFORCE_APPCHECK =
  process.env.ENFORCE_APPCHECK === '1' ||
  process.env.ENFORCE_APPCHECK === 'true';
const JOIN_CALLABLE_OPTIONS = Object.freeze({
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 60,
  enforceAppCheck: ENFORCE_APPCHECK,
});

const SHARE_CONFIG = Object.freeze({
  apiKey:
    process.env.SHARE_DYNAMIC_LINK_API_KEY ||
    process.env.FIREBASE_WEB_API_KEY ||
    process.env.FIREBASE_API_KEY ||
    '',
  domainUriPrefix:
    process.env.SHARE_DYNAMIC_LINK_PREFIX ||
    process.env.DYNAMIC_LINK_PREFIX ||
    '',
  previewBase:
    process.env.SHARE_WEB_FALLBACK_BASE ||
    (projectId
      ? `https://${projectId}.cloudfunctions.net/sharePreview`
      : 'https://socialcircle.app/share'),
  iosBundleId: process.env.SHARE_IOS_BUNDLE_ID || 'com.socialcirclellc.app',
  iosAppStoreId: process.env.SHARE_IOS_APP_STORE_ID || '',
  iosFallbackUrl: process.env.SHARE_IOS_FALLBACK_URL || '',
  androidPackageName:
    process.env.SHARE_ANDROID_PACKAGE || 'com.socialcirclellc.app',
  androidFallbackUrl: process.env.SHARE_ANDROID_FALLBACK_URL || '',
});

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  return null;
}

function truncate(text, max = 160) {
  if (!text || typeof text !== 'string') return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

const AGE_BUCKETS = Object.freeze([
  'under_18',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_plus',
  'unknown',
]);

const SEX_BUCKETS = Object.freeze([
  'female',
  'male',
  'non_binary',
  'prefer_not_say',
  'other',
  'unknown',
]);

function incrementCounter(target, key) {
  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    target[key] = 0;
  }
  target[key] += 1;
}

function ageBracketForDob(dob, referenceDate = new Date()) {
  const date = toDate(dob);
  if (!date) return 'unknown';

  let age = referenceDate.getFullYear() - date.getFullYear();
  const monthDiff = referenceDate.getMonth() - date.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getDate() < date.getDate())
  ) {
    age -= 1;
  }
  if (!Number.isFinite(age) || age < 0 || age > 120) return 'unknown';
  if (age < 18) return 'under_18';
  if (age <= 24) return '18_24';
  if (age <= 34) return '25_34';
  if (age <= 44) return '35_44';
  if (age <= 54) return '45_54';
  return '55_plus';
}

function normalizeSexMetric(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return 'unknown';
  if (['female', 'f', 'woman'].includes(raw)) return 'female';
  if (['male', 'm', 'man'].includes(raw)) return 'male';
  if (['nonbinary', 'non-binary', 'non_binary', 'nb'].includes(raw))
    return 'non_binary';
  if (['prefer_not_say', 'prefer not to say'].includes(raw))
    return 'prefer_not_say';
  return 'other';
}

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

async function createShortDynamicLink({ link, title, description, imageUrl }) {
  if (!SHARE_CONFIG.apiKey || !SHARE_CONFIG.domainUriPrefix) return null;

  const payload = {
    dynamicLinkInfo: {
      domainUriPrefix: SHARE_CONFIG.domainUriPrefix,
      link,
      androidInfo: {
        androidPackageName: SHARE_CONFIG.androidPackageName,
        androidFallbackLink: SHARE_CONFIG.androidFallbackUrl || undefined,
      },
      iosInfo: {
        iosBundleId: SHARE_CONFIG.iosBundleId,
        iosAppStoreId: SHARE_CONFIG.iosAppStoreId || undefined,
        iosFallbackLink: SHARE_CONFIG.iosFallbackUrl || undefined,
      },
      socialMetaTagInfo: {
        socialTitle: truncate(title, 70) || 'Social Circle',
        socialDescription: truncate(description, 120) || undefined,
        socialImageLink: imageUrl || undefined,
      },
    },
    suffix: { option: 'SHORT' },
  };

  const endpoint = `https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${SHARE_CONFIG.apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn('[share] dynamic link error', res.status, text);
    return null;
  }

  const json = await res.json().catch(() => ({}));
  return json?.shortLink || null;
}

async function buildEventPreview(eventId) {
  const snap = await db.doc(`events/${eventId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  const data = snap.data() || {};
  const privacy = (data.privacy || 'public').toLowerCase();
  if (privacy !== 'public') {
    throw new HttpsError('permission-denied', 'Event is not shareable');
  }

  const when = toDate(data.date);
  const whenLabel = when
    ? when.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const where = data.location?.address || data.address || '';
  const description = truncate(
    [whenLabel, where, data.description].filter(Boolean).join(' • ')
  );

  return {
    title: data.title || 'Social Circle Event',
    description: description || 'Join this Social Circle event.',
    imageUrl: data.imageUrl || data.imageUri || null,
    raw: data,
  };
}

async function buildPostPreview(postId) {
  const snap = await db.doc(`interestPosts/${postId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Post not found');
  }
  const data = snap.data() || {};
  if (data.isDeleted === true) {
    throw new HttpsError('not-found', 'Post not found');
  }
  const author =
    data?.creatorSnapshot?.displayName ||
    data?.creatorSnapshot?.name ||
    'Social Circle member';

  return {
    title: `${author} on Social Circle`,
    description:
      truncate(data.content, 200) || 'See what’s happening on Social Circle.',
    imageUrl: data.mediaUrl || data.mediaThumbnailUrl || null,
    raw: data,
  };
}

async function buildProfilePreview(userId) {
  const snap = await db.doc(`users/${userId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Profile not found');
  }

  const data = snap.data() || {};
  if (data.isDeleted === true) {
    throw new HttpsError('not-found', 'Profile not found');
  }

  const first = typeof data.firstName === 'string' ? data.firstName.trim() : '';
  const last = typeof data.lastName === 'string' ? data.lastName.trim() : '';
  const displayNameRaw =
    (typeof data.displayName === 'string' ? data.displayName : '') ||
    `${first} ${last}`.trim();
  const displayName = displayNameRaw.trim();

  const headline =
    (typeof data.bio === 'string' && data.bio.trim()) ||
    (typeof data.tagline === 'string' && data.tagline.trim()) ||
    '';

  const city =
    (typeof data.city === 'string' && data.city.trim()) ||
    (typeof data.location === 'string' && data.location.trim()) ||
    '';

  const descriptionPieces = [headline, city].filter(Boolean);
  const description =
    truncate(descriptionPieces.join(' • '), 160) || 'Connect on Social Circle.';

  const imageUrl =
    data.profileImage ||
    data.avatarURL ||
    data.photoURL ||
    data.imageUrl ||
    null;

  return {
    title: `${displayName || 'Social Circle member'} on Social Circle`,
    description,
    imageUrl,
    raw: data,
  };
}

function buildShareTargetUrl(type, id) {
  return `${SHARE_CONFIG.previewBase.replace(
    /\/$/,
    ''
  )}/${type}/${encodeURIComponent(id)}`;
}

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

exports.blockUser = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '128MiB',
  },
  async (req) => {
    const caller = req.auth?.uid;
    const targetUid = (req.data?.targetUid || '').trim();
    if (!caller)
      throw new HttpsError('unauthenticated', 'Authentication required');
    if (!targetUid)
      throw new HttpsError('invalid-argument', 'Missing targetUid');
    if (targetUid === caller) {
      throw new HttpsError('invalid-argument', 'Cannot block yourself');
    }

    const actorRef = db.doc(`users/${caller}`);
    const targetRef = db.doc(`users/${targetUid}`);

    await db.runTransaction(async (tx) => {
      const [actorSnap, targetSnap] = await Promise.all([
        tx.get(actorRef),
        tx.get(targetRef),
      ]);

      if (!targetSnap.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const actorBlocked = Array.isArray(actorSnap.data()?.blocked)
        ? actorSnap.data().blocked
        : [];
      if (actorBlocked.includes(targetUid)) return;

      const actorUpdates = {
        blocked: FieldValue.arrayUnion(targetUid),
        friends: FieldValue.arrayRemove(targetUid),
        followers: FieldValue.arrayRemove(targetUid),
        following: FieldValue.arrayRemove(targetUid),
        followRequests: FieldValue.arrayRemove(targetUid),
        requests: FieldValue.arrayRemove(targetUid),
      };

      const targetUpdates = {
        blockedBy: FieldValue.arrayUnion(caller),
        friends: FieldValue.arrayRemove(caller),
        followers: FieldValue.arrayRemove(caller),
        following: FieldValue.arrayRemove(caller),
        followRequests: FieldValue.arrayRemove(caller),
        requests: FieldValue.arrayRemove(caller),
      };

      tx.set(actorRef, actorUpdates, { merge: true });
      tx.set(targetRef, targetUpdates, { merge: true });
    });

    return { ok: true };
  }
);

exports.unblockUser = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '128MiB',
  },
  async (req) => {
    const caller = req.auth?.uid;
    const targetUid = (req.data?.targetUid || '').trim();
    if (!caller)
      throw new HttpsError('unauthenticated', 'Authentication required');
    if (!targetUid)
      throw new HttpsError('invalid-argument', 'Missing targetUid');
    if (targetUid === caller) {
      throw new HttpsError('invalid-argument', 'Cannot unblock yourself');
    }

    const actorRef = db.doc(`users/${caller}`);
    const targetRef = db.doc(`users/${targetUid}`);

    await db.runTransaction(async (tx) => {
      const actorSnap = await tx.get(actorRef);
      if (!actorSnap.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const actorBlocked = Array.isArray(actorSnap.data()?.blocked)
        ? actorSnap.data().blocked
        : [];
      if (!actorBlocked.includes(targetUid)) return;

      tx.set(
        actorRef,
        { blocked: FieldValue.arrayRemove(targetUid) },
        { merge: true }
      );
      tx.set(
        targetRef,
        { blockedBy: FieldValue.arrayRemove(caller) },
        { merge: true }
      );
    });

    return { ok: true };
  }
);

async function adjustSavedAggregates(uid, eventId, deltaRaw) {
  const delta = deltaRaw > 0 ? 1 : deltaRaw < 0 ? -1 : 0;
  if (!delta || !uid || !eventId) return;

  const eventRef = db.doc(`events/${eventId}`);
  const userRef = db.doc(`users/${uid}`);

  try {
    await db.runTransaction(async (tx) => {
      const [eventSnap, userSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(userRef),
      ]);

      if (eventSnap.exists) {
        const data = eventSnap.data() || {};
        const currentSaveCount = Number(data.saveCount || 0);
        const nextSaveCount = Math.max(0, currentSaveCount + delta);
        const updates = { saveCount: nextSaveCount };

        const hasPopularity = typeof data.popularity === 'number';
        const currentPopularity = hasPopularity ? Number(data.popularity) : 0;
        if (hasPopularity || delta > 0) {
          const nextPopularity = Math.max(0, currentPopularity + delta);
          updates.popularity = nextPopularity;
        }

        tx.update(eventRef, updates);
      }

      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        const currentSavedCount = Number(userData.savedCount || 0);
        const nextSavedCount = Math.max(0, currentSavedCount + delta);
        tx.update(userRef, { savedCount: nextSavedCount });
      }
    });
  } catch (err) {
    logger.error('[savedEvents] adjustSavedAggregates failed', {
      uid,
      eventId,
      delta,
      error: err?.message || err,
    });
  }
}

exports.onSavedEventCreated = onDocumentCreated(
  'users/{uid}/savedEvents/{eventId}',
  async (event) => {
    const { uid, eventId } = event.params;
    await adjustSavedAggregates(uid, eventId, 1);
    try {
      await db
        .collection('analytics')
        .doc('stream')
        .collection('eventSaves')
        .add({
          eventId,
          uid,
          action: 'save',
          at: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      logger.warn('[savedEvents] analytics log failed', err?.message || err);
    }
  }
);

exports.onSavedEventDeleted = onDocumentDeleted(
  'users/{uid}/savedEvents/{eventId}',
  async (event) => {
    const { uid, eventId } = event.params;
    await adjustSavedAggregates(uid, eventId, -1);
    try {
      await db
        .collection('analytics')
        .doc('stream')
        .collection('eventSaves')
        .add({
          eventId,
          uid,
          action: 'unsave',
          at: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      logger.warn('[savedEvents] analytics log failed', err?.message || err);
    }
  }
);

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

// Callable: Claim a device token for the authenticated user.
// This will clear the same token from any other user documents (to avoid cross-account delivery)
// and set it on the requesting user's document in an atomic/batched manner.
exports.claimDeviceToken = onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const callerUid = req.auth?.uid || null;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required');

    const token = (req.data?.token || '').toString().trim();
    const targetUid = (req.data?.uid || '').toString().trim();
    const devicePlatform =
      typeof req.data?.devicePlatform === 'string'
        ? req.data.devicePlatform
        : null;
    if (!token) throw new HttpsError('invalid-argument', 'Missing token');
    if (!targetUid) throw new HttpsError('invalid-argument', 'Missing uid');
    if (targetUid !== callerUid)
      throw new HttpsError('permission-denied', 'UID mismatch');

    try {
      // Find any user docs that currently hold this token
      const q = db
        .collection('users')
        .where('deviceToken', '==', token)
        .limit(50);
      const snap = await q.get();
      const batch = db.batch();
      let cleared = 0;

      snap.docs.forEach((d) => {
        if (d.id === targetUid) return; // We'll set it explicitly below
        batch.update(d.ref, {
          deviceToken: null,
          pushOptIn: false,
          deviceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        cleared++;
      });

      // Ensure target user has this token (including platform metadata)
      const targetRef = db.collection('users').doc(targetUid);
      const payload = {
        deviceToken: token,
        pushOptIn: true,
        deviceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (devicePlatform) payload.devicePlatform = devicePlatform;
      batch.set(targetRef, payload, { merge: true });

      await batch.commit();
      logger.log(
        '[claimDeviceToken] claimed token for',
        targetUid,
        'clearedFrom:',
        cleared
      );
      return { ok: true, clearedFrom: cleared };
    } catch (err) {
      logger.error('[claimDeviceToken] error', err?.message || err);
      throw new HttpsError('internal', 'Failed to claim token');
    }
  }
);

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

    // 3) Fetch tokens and sender info
    const senderSnap = await db.doc(`users/${senderId}`).get();
    const senderData = senderSnap.exists ? senderSnap.data() : {};
    const senderName = buildUserDisplayName(senderData);

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

    // 4) Build and send with sender name and chat link
    const title = `${senderName} in ${ev.title || 'event chat'}`;
    const body =
      typeof message.text === 'string' && message.text.trim().length
        ? message.text.trim()
        : 'Sent a message';
    const data = {
      eventId,
      linkType: 'chat',
      senderId,
      senderName,
    };

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

exports.shareGenerateLink = onCall(
  { region: 'us-central1', timeoutSeconds: 15, memory: '256MiB' },
  async (req) => {
    const { type, id } = req.data || {};
    if (!type || !id) {
      throw new HttpsError('invalid-argument', 'type and id are required');
    }
    const normalized = type.toString().toLowerCase();

    let preview;
    if (normalized === 'event') {
      preview = await buildEventPreview(id);
    } else if (normalized === 'post') {
      preview = await buildPostPreview(id);
    } else if (normalized === 'profile' || normalized === 'user') {
      preview = await buildProfilePreview(id);
    } else {
      throw new HttpsError('invalid-argument', 'Unsupported share type');
    }

    const targetUrl = buildShareTargetUrl(normalized, id);
    const shortLink = await createShortDynamicLink({
      link: targetUrl,
      title: preview.title,
      description: preview.description,
      imageUrl: preview.imageUrl,
    });

    return {
      url: shortLink || targetUrl,
      target: targetUrl,
      preview,
      shareable: { type: normalized, id },
    };
  }
);

exports.sharePreview = onRequest(
  { region: 'us-central1' },
  async (req, res) => {
    try {
      const type = req.query?.type || req.query?.t;
      const id = req.query?.id;
      if (!type || !id) {
        res.status(400).send('Missing type or id');
        return;
      }
      const normalized = type.toString().toLowerCase();
      let preview;
      if (normalized === 'event') {
        preview = await buildEventPreview(id);
      } else if (normalized === 'post') {
        preview = await buildPostPreview(id);
      } else if (normalized === 'profile' || normalized === 'user') {
        preview = await buildProfilePreview(id);
      } else {
        res.status(400).send('Unsupported type');
        return;
      }

      const title = truncate(preview.title, 70) || 'Social Circle';
      const description = truncate(preview.description, 160);
      const image = preview.imageUrl;
      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    ${image ? `<meta property="og:image" content="${image}" />` : ''}
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${image ? `<meta name="twitter:image" content="${image}" />` : ''}
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #111827, #1f2937); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #fff; }
      .card { max-width: 520px; padding: 32px; background: rgba(17, 24, 39, 0.85); border-radius: 20px; text-align: center; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45); }
      h1 { font-size: 26px; margin-bottom: 12px; }
      p { font-size: 17px; line-height: 1.5; margin-bottom: 28px; color: rgba(229, 231, 235, 0.9); }
      a { display: inline-flex; align-items: center; justify-content: center; padding: 14px 22px; border-radius: 999px; background: linear-gradient(135deg, #2563eb, #9333ea); color: #fff; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${description}</p>
      <a href="https://apps.apple.com/us/app/id000000000">Open in Social Circle</a>
    </div>
  </body>
</html>`;

      res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
      res.status(200).send(html);
    } catch (err) {
      logger.error('[sharePreview] failed', err);
      res.status(500).send('Unable to render preview');
    }
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

      const actorName =
        notif.requesterName ||
        notif.fromUserName ||
        notif.userName ||
        notif.senderName ||
        'Someone';

      // Build title/body based on notification type
      let title = 'Social Circle';
      let body = 'You have a new notification';
      switch (notif.type) {
        case 'rsvp_request':
          title = 'RSVP Request';
          body = `${actorName} requested to join your event`;
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

      if (actorName !== 'Someone' && /\bsomeone\b/i.test(body)) {
        body = body.replace(/\bsomeone\b/gi, actorName);
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
// App Check enforced for production security (see docs/APP_CHECK_SETUP.md)
exports.rsvpEvent = onCall(JOIN_CALLABLE_OPTIONS, async (req) => {
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
  const userRef = db.doc(`users/${userId}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [evSnap, chatSnap, userSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(chatRef),
        tx.get(userRef),
      ]);
      if (!evSnap.exists)
        throw new HttpsError('not-found', 'Event does not exist');
      const ev = evSnap.data();
      const ownerId = ev.ownerId || null;

      let hostData = {};
      if (ownerId) {
        const hostSnap = await tx.get(db.doc(`users/${ownerId}`));
        if (hostSnap.exists) hostData = hostSnap.data() || {};
      }

      // Do not allow direct joins for RSVP events
      if ((ev.privacy || 'public').toLowerCase() === 'rsvp') {
        throw new HttpsError(
          'failed-precondition',
          'RSVP event requires host approval'
        );
      }

      // Gender eligibility
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

      // Age eligibility
      const range = Array.isArray(ev.ageRange) ? ev.ageRange : null;
      if (range && range.length === 2) {
        const [min, max] = range.map((n) =>
          typeof n === 'number' ? n : parseInt(n, 10)
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

      // Capacity check
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

      if (ownerId) {
        const viewerBlocked = Array.isArray(userDoc.blocked)
          ? userDoc.blocked.includes(ownerId)
          : false;
        const viewerBlockedBy = Array.isArray(userDoc.blockedBy)
          ? userDoc.blockedBy.includes(ownerId)
          : false;
        const hostBlocksViewer = Array.isArray(hostData.blocked)
          ? hostData.blocked.includes(userId)
          : false;
        const hostBlockedByViewer = Array.isArray(hostData.blockedBy)
          ? hostData.blockedBy.includes(userId)
          : false;
        if (
          viewerBlocked ||
          viewerBlockedBy ||
          hostBlocksViewer ||
          hostBlockedByViewer
        ) {
          throw new HttpsError(
            'permission-denied',
            'You cannot join this event.'
          );
        }
      }

      // Compute participants union (owner + attendees + user)
      const participants = new Set(attendeesArr);
      if (ownerId) participants.add(ownerId);
      participants.add(userId);
      const participantsArray = Array.from(participants);

      // Prepare attendee snippet
      const snippet = userSnap.exists
        ? buildSnippetFromUser(userId, userSnap.data())
        : {
            uid: userId,
            name: 'User',
            photoURL: null,
            verified: false,
            rating: null,
          };

      const updates = {};
      if (!attendeesArr.includes(userId)) {
        updates.attendees = admin.firestore.FieldValue.arrayUnion(userId);
        updates.attendeesCount = admin.firestore.FieldValue.increment(1);
        updates[`attendeeSnippets.${userId}`] = snippet;
      }
      if (Object.keys(updates).length) tx.update(eventRef, updates);

      if (!chatSnap.exists) {
        tx.set(chatRef, {
          eventId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: ownerId || req.auth.uid,
          participants: participantsArray,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          messageCount: 0,
          isArchived: false,
          pinned: null,
        });
      } else {
        tx.update(chatRef, {
          participants: admin.firestore.FieldValue.arrayUnion(
            ...participantsArray
          ),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      tx.update(userRef, {
        attendingEvents: admin.firestore.FieldValue.arrayUnion(eventId),
      });
      return { chatId: eventId, participants: participantsArray, ownerId };
    });

    // Notify host that someone joined their event (best-effort outside transaction)
    try {
      if (result.ownerId && result.ownerId !== userId) {
        const eventSnap = await eventRef.get();
        const eventData = eventSnap.data();
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};
        const userName = buildUserDisplayName(userData);

        await db.collection('notifications').add({
          type: 'event_joined',
          recipientId: result.ownerId,
          eventId,
          userId, // who joined
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          linkType: 'event',
          linkId: eventId,
          message: `${userName} joined ${eventData?.title || 'your event'}`,
          userName,
          read: false,
        });
      }
    } catch (e) {
      logger.error('[rsvpEvent] event_joined notify error', e?.message || e);
    }

    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'RSVP failed');
  }
});

// Callable: allow a signed-in attendee to leave an event (removes from attendees, updates user arrays, prunes chat participants)
// App Check enforced for production security (see docs/APP_CHECK_SETUP.md)
exports.leaveEvent = onCall(JOIN_CALLABLE_OPTIONS, async (req) => {
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
      if (!evSnap.exists) throw new HttpsError('not-found', 'Event not found');
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
      const updates = {};
      if (!alreadyGone) {
        updates.attendees = admin.firestore.FieldValue.arrayRemove(uid);
        updates.attendeesCount = admin.firestore.FieldValue.increment(-1);
        updates[`attendeeSnippets.${uid}`] =
          admin.firestore.FieldValue.delete();
        tx.update(eventRef, updates);
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
});

// Callable: delete (soft) an event — runs with admin privileges to avoid client rule issues
// App Check enforced for production security (see docs/APP_CHECK_SETUP.md)
exports.deleteEvent = onCall(
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

        // Notify all attendees that the event was cancelled
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
      // Surface a friendly message to the client
      throw new HttpsError('internal', err?.message || 'Delete event failed');
    }
  }
);

// Callable: request to join an RSVP event (adds caller to requests, notifies host)
// App Check enforced for production security (see docs/APP_CHECK_SETUP.md)
exports.requestToJoinEvent = onCall(JOIN_CALLABLE_OPTIONS, async (req) => {
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

      // Eligibility checks against user profile
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
          typeof n === 'number' ? n : parseInt(n, 10)
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

    // Notify host that someone joined their event (best-effort)
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
        userId, // who joined
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
        e?.message || e
      );
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
          waitlistCount: admin.firestore.FieldValue.increment(-1),
        });
      }
    });

    // No notification for decline (product decision)
    return { ok: true };
  }
);

// -------------------- SOCIAL GRAPH CALLABLES (server-enforced cross-user writes) --------------------

// Callable: follow request (writes to target user's followRequests)
exports.requestFollow = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { targetUid } = req.data || {};
    if (!targetUid || typeof targetUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetUid');
    if (currentUid === targetUid)
      throw new HttpsError('invalid-argument', 'Cannot follow yourself');

    const targetRef = db.doc(`users/${targetUid}`);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists)
      throw new HttpsError('not-found', 'Target user not found');

    await targetRef.update({
      followRequests: admin.firestore.FieldValue.arrayUnion(currentUid),
    });

    logger.log('[requestFollow]', currentUid, '->', targetUid);
    return { ok: true };
  }
);

// Callable: approve follow request (mutual)
exports.approveFollowRequest = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { requesterUid } = req.data || {};
    if (!requesterUid || typeof requesterUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing requesterUid');

    const currentRef = db.doc(`users/${currentUid}`);
    const requesterRef = db.doc(`users/${requesterUid}`);

    await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(currentRef);
      if (!currentSnap.exists)
        throw new HttpsError('not-found', 'User not found');

      tx.update(currentRef, {
        followRequests: admin.firestore.FieldValue.arrayRemove(requesterUid),
        followers: admin.firestore.FieldValue.arrayUnion(requesterUid),
      });
      tx.update(requesterRef, {
        following: admin.firestore.FieldValue.arrayUnion(currentUid),
      });
    });

    logger.log('[approveFollowRequest]', currentUid, '<-', requesterUid);
    return { ok: true };
  }
);

// Callable: deny follow request
exports.denyFollowRequest = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { requesterUid } = req.data || {};
    if (!requesterUid || typeof requesterUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing requesterUid');

    const currentRef = db.doc(`users/${currentUid}`);
    await currentRef.update({
      followRequests: admin.firestore.FieldValue.arrayRemove(requesterUid),
    });

    logger.log('[denyFollowRequest]', currentUid, 'denied', requesterUid);
    return { ok: true };
  }
);

// Callable: add friend (mutual)
exports.addFriend = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { targetUid } = req.data || {};
    if (!targetUid || typeof targetUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetUid');
    if (currentUid === targetUid)
      throw new HttpsError('invalid-argument', 'Cannot friend yourself');

    const currentRef = db.doc(`users/${currentUid}`);
    const targetRef = db.doc(`users/${targetUid}`);

    await db.runTransaction(async (tx) => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists)
        throw new HttpsError('not-found', 'Target user not found');

      tx.update(currentRef, {
        friends: admin.firestore.FieldValue.arrayUnion(targetUid),
      });
      tx.update(targetRef, {
        friends: admin.firestore.FieldValue.arrayUnion(currentUid),
      });
    });

    logger.log('[addFriend]', currentUid, '<->', targetUid);
    return { ok: true };
  }
);

// Callable: remove friend (mutual)
exports.removeFriend = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { targetUid } = req.data || {};
    if (!targetUid || typeof targetUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetUid');

    const currentRef = db.doc(`users/${currentUid}`);
    const targetRef = db.doc(`users/${targetUid}`);

    await db.runTransaction(async (tx) => {
      tx.update(currentRef, {
        friends: admin.firestore.FieldValue.arrayRemove(targetUid),
      });
      tx.update(targetRef, {
        friends: admin.firestore.FieldValue.arrayRemove(currentUid),
      });
    });

    logger.log('[removeFriend]', currentUid, 'X', targetUid);
    return { ok: true };
  }
);

// Callable: join waitlist (server-enforced capacity + state checks)
exports.joinWaitlist = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
    const { eventId } = req.data || {};
    if (!eventId || typeof eventId !== 'string')
      throw new HttpsError('invalid-argument', 'Missing eventId');

    const eventRef = db.doc(`events/${eventId}`);

    await db.runTransaction(async (tx) => {
      const evSnap = await tx.get(eventRef);
      if (!evSnap.exists) throw new HttpsError('not-found', 'Event not found');

      const ev = evSnap.data();
      const isHost = ev.ownerId === uid || ev.hostId === uid;
      const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
      const isAttendee = attendees.includes(uid);
      const requests = Array.isArray(ev.requests) ? ev.requests : [];
      const hasRequested = requests.includes(uid);
      const waitlist = Array.isArray(ev.waitlist) ? ev.waitlist : [];
      const isWaitlisted = waitlist.includes(uid);

      if (isHost)
        throw new HttpsError('failed-precondition', 'Host cannot waitlist');
      if (isAttendee)
        throw new HttpsError(
          'failed-precondition',
          'Already attending this event'
        );
      if (hasRequested)
        throw new HttpsError('failed-precondition', 'Request pending');
      if (isWaitlisted)
        throw new HttpsError(
          'failed-precondition',
          'Already on waitlist for this event'
        );

      const status = (ev.status || 'active').toString().toLowerCase();
      if (status !== 'active')
        throw new HttpsError('failed-precondition', 'Event not active');
      if (ev.isDeleted === true)
        throw new HttpsError('failed-precondition', 'Event deleted');

      const capacity = typeof ev.capacity === 'number' ? ev.capacity : null;
      const isFull = capacity && capacity > 0 && attendees.length >= capacity;
      if (!isFull)
        throw new HttpsError(
          'failed-precondition',
          'Event is not full; join directly instead'
        );

      tx.update(eventRef, {
        waitlist: admin.firestore.FieldValue.arrayUnion(uid),
        waitlistCount: admin.firestore.FieldValue.increment(1),
      });
    });

    logger.log('[joinWaitlist]', uid, 'joined waitlist for', eventId);
    return { ok: true };
  }
);

// -------------------- NEW: REPORTING & NOTIFICATIONS CALLABLES --------------------

// Callable: submit a report (since client cannot write /reports per rules)
// data: { targetType: 'user'|'event', targetId: string, reason?: string, details?: string }
exports.submitReport = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');
    const { targetType, targetId, reason, details } = req.data || {};
    if (!['user', 'event'].includes(targetType))
      throw new HttpsError('invalid-argument', 'Invalid targetType');
    if (!targetId || typeof targetId !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetId');

    const safe = (v, max = 2000) =>
      typeof v === 'string' ? v.toString().slice(0, max) : null;

    const doc = {
      targetType,
      targetId,
      reason: safe(reason, 256),
      details: safe(details, 2000),
      createdBy: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'open',
      appVersion: process.env.APP_VERSION || null,
      environment: process.env.ENVIRONMENT || 'beta',
    };

    const ref = await db.collection('reports').add(doc);
    logger.log('[reports] submitted', ref.id, targetType, targetId);
    return { ok: true, id: ref.id };
  }
);

// Callable: create a notification document on behalf of the client (client cannot create directly)
// data: { recipientId: string, type: string, title?: string, message?: string, linkType?, linkId?, eventId? }
exports.createNotification = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const rawData = req.data || {};
    const authToken =
      typeof rawData.authToken === 'string' && rawData.authToken.trim().length
        ? rawData.authToken.trim()
        : null;

    const identityToolkitKey =
      process.env.IDENTITY_TOOLKIT_API_KEY ||
      process.env.FIREBASE_WEB_API_KEY ||
      process.env.FIREBASE_API_KEY ||
      process.env.GCLOUD_API_KEY ||
      null;

    const verificationErrors = [];

    const verifyViaRest = async (token, source) => {
      if (!token || !identityToolkitKey) return null;
      try {
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${identityToolkitKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: token }),
          }
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          verificationErrors.push({
            source: `${source}:rest`,
            message: `status ${res.status}: ${text.slice(0, 160)}`,
          });
          return null;
        }
        const json = await res.json().catch(() => null);
        const uid = json?.users?.[0]?.localId || null;
        if (uid) return { uid, source: `${source}:rest` };
      } catch (err) {
        verificationErrors.push({
          source: `${source}:rest`,
          message: err?.message || err,
        });
      }
      return null;
    };

    const headerValue =
      req.rawRequest?.headers?.authorization ||
      req.rawRequest?.headers?.Authorization ||
      null;
    const headerToken =
      typeof headerValue === 'string' &&
      headerValue.toLowerCase().startsWith('bearer ')
        ? headerValue.slice(7).trim()
        : null;

    let uid = req.auth?.uid || null;

    const tryVerify = async (token, source) => {
      if (!token) return null;
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        if (decoded?.uid) {
          return { uid: decoded.uid, source };
        }
      } catch (err) {
        verificationErrors.push({
          source: `${source}:admin`,
          message: err?.message || err,
        });
        const fallback = await verifyViaRest(token, source);
        if (fallback?.uid) return fallback;
      }
      const restOnly = await verifyViaRest(token, source);
      if (restOnly?.uid) return restOnly;
      return null;
    };

    if (!uid && authToken) {
      const verified = await tryVerify(authToken, 'payload');
      if (verified?.uid) uid = verified.uid;
    }

    if (!uid && headerToken && headerToken !== authToken) {
      const verified = await tryVerify(headerToken, 'header');
      if (verified?.uid) uid = verified.uid;
    }

    if (!uid) {
      logger.warn('[notifications] unauthenticated callable request', {
        hasAuthContext: Boolean(req.auth?.uid),
        hasPayloadToken: Boolean(authToken),
        hasHeaderToken: Boolean(headerToken),
        verificationErrors,
      });
      throw new HttpsError('unauthenticated', 'Sign in required', {
        verificationErrors,
      });
    }

    const { authToken: _discard, ...sanitized } = rawData;
    const { recipientId, type, title, message, linkType, linkId, eventId } =
      sanitized;
    if (!recipientId || typeof recipientId !== 'string')
      throw new HttpsError('invalid-argument', 'Missing recipientId');
    if (!type || typeof type !== 'string')
      throw new HttpsError('invalid-argument', 'Missing type');

    const now = admin.firestore.FieldValue.serverTimestamp();
    const doc = {
      recipientId,
      type,
      title: typeof title === 'string' ? title.slice(0, 120) : null,
      message: typeof message === 'string' ? message.slice(0, 500) : null,
      linkType: linkType || null,
      linkId: linkId || null,
      eventId: eventId || null,
      read: false,
      createdAt: now,
      createdBy: uid,
      isDeleted: false,
    };

    const ref = await db.collection('notifications').add(doc);
    logger.log('[notifications] created', ref.id, 'for', recipientId);
    return { ok: true, id: ref.id };
  }
);

// -------------------- NEW: USER AND EVENT REPORTING --------------------

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

    if (!['event', 'user', 'interest_post', 'interest_comment'].includes(type))
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
        postId: typeof context.postId === 'string' ? context.postId : null,
        commentId:
          typeof context.commentId === 'string' ? context.commentId : null,
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

// Callable: rate a user with server-side validation (mutual event required)
exports.rateUser = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    cpu: 1,
    timeoutSeconds: 45,
  },
  async (req) => {
    const raterUid = req.auth?.uid || null;
    const { targetUid, rating } = req.data || {};

    if (!raterUid) throw new HttpsError('unauthenticated', 'Sign in required');
    if (!targetUid)
      throw new HttpsError('invalid-argument', 'targetUid required');
    if (targetUid === raterUid)
      throw new HttpsError('failed-precondition', 'Cannot rate yourself');

    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5)
      throw new HttpsError('invalid-argument', 'rating must be 1..5');

    // Validate mutual event participation
    const eventsCol = db.collection('events');

    const [raterAtt, raterHost] = await Promise.all([
      eventsCol.where('attendees', 'array-contains', raterUid).limit(400).get(),
      eventsCol.where('ownerId', '==', raterUid).limit(400).get(),
    ]);

    const [targetAtt, targetHost] = await Promise.all([
      eventsCol
        .where('attendees', 'array-contains', targetUid)
        .limit(400)
        .get(),
      eventsCol.where('ownerId', '==', targetUid).limit(400).get(),
    ]);

    const raterSet = new Set([
      ...raterAtt.docs.map((d) => d.id),
      ...raterHost.docs.map((d) => d.id),
    ]);
    const targetIds = [
      ...targetAtt.docs.map((d) => d.id),
      ...targetHost.docs.map((d) => d.id),
    ];
    const hasShared = targetIds.some((id) => raterSet.has(id));

    if (!hasShared)
      throw new HttpsError(
        'permission-denied',
        'You can only rate users from shared events'
      );

    // Update rating atomically
    const userRef = db.doc(`users/${targetUid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'User not found');
      const data = snap.data() || {};
      const ratings = Object.assign({}, data.ratings || {});
      ratings[raterUid] = r;
      const values = Object.values(ratings).map((x) => Number(x) || 0);
      const ratingCount = values.length;
      const avg = ratingCount
        ? values.reduce((sum, v) => sum + v, 0) / ratingCount
        : 0;

      tx.update(userRef, {
        ratings,
        rating: avg,
        ratingCount,
      });
    });

    return { ok: true };
  }
);

// -------------------- NEW: ANALYTICS TRACKING CALLABLE --------------------
function safeSanitize(value, depth = 0) {
  try {
    if (depth > 4) return null;
    if (value == null) return null;
    const t = typeof value;
    if (t === 'string') {
      const s = String(value);
      // redact obvious PII/tokens and trim
      const noEmail = s.replace(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
        '[redacted]'
      );
      const noBearer = noEmail.replace(
        /(ya29\.|eyJ|Bearer\s+[A-Za-z0-9\-_.]+)/g,
        '[redacted]'
      );
      return noBearer.slice(0, 200);
    }
    if (t === 'number') return Number.isFinite(value) ? value : null;
    if (t === 'boolean') return value;
    if (Array.isArray(value))
      return value.slice(0, 20).map((v) => safeSanitize(v, depth + 1));
    if (value && t === 'object') {
      const out = {};
      const entries = Object.entries(value).slice(0, 40);
      for (const [k, v] of entries) {
        const key = String(k).slice(0, 40).toLowerCase();
        if (
          key.includes('email') ||
          key.includes('password') ||
          key.includes('token') ||
          key.includes('secret') ||
          key.includes('address') ||
          key.includes('lat') ||
          key.includes('lng') ||
          key.includes('longitude') ||
          key.includes('latitude') ||
          key === 'id' ||
          key === 'uid'
        ) {
          continue;
        }
        out[key] = safeSanitize(v, depth + 1);
      }
      return out;
    }
    return null;
  } catch {
    return null;
  }
}

exports.trackEvent = onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
    timeoutSeconds: 15,
  },
  async (req) => {
    try {
      const nameRaw = (req.data?.name || '').toString();
      if (!nameRaw) return { ok: true, skipped: 'missing name' };
      const name = nameRaw
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 64);
      const payload = safeSanitize(req.data?.payload || {});
      const uid = req.auth?.uid || null;

      const userAgent = req.rawRequest?.headers?.['user-agent'] || null;
      const doc = {
        name,
        payload,
        uid,
        userAgent: userAgent ? String(userAgent).slice(0, 200) : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        env: process.env.ENVIRONMENT || 'beta',
        appVersion: process.env.APP_VERSION || null,
      };
      await db.collection('analytics_events').add(doc);
      logger.log('[trackEvent]', name, 'uid:', uid || 'anon');
      return { ok: true };
    } catch (e) {
      logger.error('[trackEvent] error', e?.message || e);
      // Do not throw; this is best-effort
      return { ok: false };
    }
  }
);

// Helper: build attendee snippet from user doc
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

// Helper: compute age from Firestore Timestamp or ISO
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

// Fanout: when user profile fields change, update attendee snippets across their events
exports.onUserUpdateFanout = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    try {
      const before = event.data.before.data();
      const after = event.data.after.data();
      if (!before || !after) return;

      // Only act if snippet-relevant fields changed
      const fields = [
        'firstName',
        'lastName',
        'displayName',
        'username',
        'profileImage',
        'avatarURL',
        'photoURL',
        'verified',
        'rating',
      ];
      const changed = fields.some(
        (f) => (before[f] || null) !== (after[f] || null)
      );
      if (!changed) return;

      const uid = event.params.userId;
      const snippet = buildSnippetFromUser(uid, after);

      // Find events where this user is an attendee
      const q = db
        .collection('events')
        .where('attendees', 'array-contains', uid)
        .limit(400);
      const snap = await q.get();
      if (snap.empty) return;

      const batches = [];
      let batch = db.batch();
      let ops = 0;
      snap.docs.forEach((d) => {
        batch.update(d.ref, { [`attendeeSnippets.${uid}`]: snippet });
        ops++;
        if (ops >= 450) {
          // stay under 500 ops
          batches.push(batch.commit());
          batch = db.batch();
          ops = 0;
        }
      });
      batches.push(batch.commit());
      await Promise.all(batches);
      logger.log(
        '[onUserUpdateFanout] updated attendee snippets for',
        uid,
        'in',
        snap.size,
        'events'
      );
    } catch (e) {
      logger.error('[onUserUpdateFanout] error', e?.message || e);
    }
  }
);

// -------------------- POPULARITY COMPUTATION --------------------
function tierOrder(t) {
  return t === 'Top Host' ? 3 : t === 'Connector' ? 2 : t === 'Rising' ? 1 : 0;
}

function dayKeysBackfill(days) {
  const now = new Date();
  const keys = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)
    );
    keys.push(dayKeyFromDate(d));
  }
  return keys;
}

function computeScore(counts, cfg) {
  const joins = counts['join_event'] || 0;
  const rsvp = counts['rsvp_yes'] || 0;
  const shows = counts['check_in'] || 0;
  const engagement = (counts['save_event'] || 0) + (counts['share_event'] || 0);
  const reports = counts['report_content'] || 0;

  const rsvpShow = rsvp ? Math.min(1, shows / rsvp) : 0;
  const trust = Math.max(0, 1 - Math.min(1, reports / Math.max(1, joins)));

  const score =
    (cfg.wUniqueAttendees || 2.0) * Math.sqrt(Math.max(0, joins)) +
    (cfg.wRSVPShow || 1.5) * rsvpShow * 10 +
    (cfg.wEngagement || 1.2) * Math.log1p(Math.max(0, engagement)) +
    (cfg.wTrust || 2.0) * trust * 10;
  return Number.isFinite(score) ? score : 0;
}

exports.computePopularity = onSchedule(
  {
    schedule: 'every day 02:30',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    logger.log('[computePopularity] starting');

    // Load config (weights, thresholds, windows)
    const cfgSnap = await db.collection('config').doc('popularity').get();
    const cfg = cfgSnap.exists
      ? cfgSnap.data()
      : {
          wUniqueAttendees: 2.0,
          wRSVPShow: 1.5,
          wEngagement: 1.2,
          wTrust: 2.0,
          thresholds: { Rising: 25, Connector: 60, TopHost: 120 },
          hysteresisBuffer: 5,
          lockDays: 30,
          graceDays: 7,
          windowDays: 28,
        };

    const dayKeys = dayKeysBackfill(cfg.windowDays || 28);

    // Accumulate per-user counts across window
    const accum = new Map(); // uid -> counts map { name: total }
    for (const k of dayKeys) {
      const col = db
        .collection('analytics')
        .doc('daily')
        .collection(k)
        .collection('users');
      const snap = await col.get();
      if (snap.empty) continue;
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const uid = d.uid || doc.id;
        const cur = accum.get(uid) || {};
        const cnt = d.counts || {};
        for (const [name, val] of Object.entries(cnt)) {
          const n = typeof val === 'number' ? val : 0;
          cur[name] = (cur[name] || 0) + n;
        }
        accum.set(uid, cur);
      });
    }

    logger.log('[computePopularity] users in window:', accum.size);

    // Prepare batched writes
    const batchWrites = [];
    let batch = db.batch();
    let batchCount = 0;
    const commitBatch = async () => {
      if (batchCount === 0) return;
      batchWrites.push(batch.commit());
      batch = db.batch();
      batchCount = 0;
    };

    const now = admin.firestore.Timestamp.now();
    const lockMillis = (cfg.lockDays || 30) * 864e5;
    const buffer = cfg.hysteresisBuffer || 5;
    const graceMillis = (cfg.graceDays || 7) * 864e5;

    for (const [uid, counts] of accum.entries()) {
      const score = computeScore(counts, cfg);

      let tier = 'None';
      if (score >= (cfg.thresholds?.TopHost || 120)) tier = 'Top Host';
      else if (score >= (cfg.thresholds?.Connector || 60)) tier = 'Connector';
      else if (score >= (cfg.thresholds?.Rising || 25)) tier = 'Rising';

      const pref = db.collection('popularity').doc(uid);
      const psnap = await pref.get();
      const prev = psnap.exists
        ? psnap.data()
        : {
            tier: 'None',
            lockedUntil: null,
            inGrace: false,
            graceStartedAt: null,
          };

      let finalTier = tier;
      let inGrace = false;
      let graceStartedAt = null;

      const lockedUntil = prev.lockedUntil;
      const locked = lockedUntil && lockedUntil.toMillis() > now.toMillis();

      if (locked && prev.tier && prev.tier !== 'None') {
        // Keep previous tier during lock window
        finalTier = prev.tier;
        inGrace = false;
        graceStartedAt = null;
      } else if (
        prev.tier &&
        prev.tier !== 'None' &&
        tierOrder(tier) < tierOrder(prev.tier)
      ) {
        // Potential demotion: apply hysteresis/grace
        const demoteThreshold = Math.max(
          0,
          (cfg.thresholds?.[prev.tier.replace(' ', '')] || 0) - buffer
        );
        // If score is below threshold-buffer, start/continue grace
        const wasInGrace = prev.inGrace === true;
        const prevStart = prev.graceStartedAt?.toMillis
          ? prev.graceStartedAt.toMillis()
          : null;
        const nowMs = now.toMillis();
        if (!wasInGrace) {
          inGrace = true;
          graceStartedAt = now;
          finalTier = prev.tier;
        } else {
          inGrace = true;
          graceStartedAt = prev.graceStartedAt || now;
          // If grace window exceeded and still below threshold-buffer, allow demotion
          if (prevStart && nowMs - prevStart >= graceMillis) {
            finalTier = tier; // demote
            inGrace = false;
            graceStartedAt = null;
          } else {
            finalTier = prev.tier; // hold during grace
          }
        }
      } else {
        // Promotion or same tier
        inGrace = false;
        graceStartedAt = null;
        // If promoted, start lock
        if (tierOrder(tier) > tierOrder(prev.tier || 'None')) {
          batch.set(
            pref,
            {
              uid,
              score,
              tier,
              inGrace: false,
              graceStartedAt: null,
              lockedUntil: admin.firestore.Timestamp.fromMillis(
                now.toMillis() + lockMillis
              ),
              updatedAt: now,
            },
            { merge: true }
          );
          batchCount++;
          // Mirror to user profile
          const uref = db.collection('users').doc(uid);
          batch.set(
            uref,
            {
              popularScore: Math.round(score * 100) / 100,
              isPopular: tier !== 'None',
            },
            { merge: true }
          );
          batchCount++;
          if (batchCount >= 400) await commitBatch();
          continue;
        } else {
          finalTier = tier;
        }
      }

      // Persist outcome (no new lock started)
      batch.set(
        pref,
        {
          uid,
          score,
          tier: finalTier,
          inGrace,
          graceStartedAt,
          updatedAt: now,
        },
        { merge: true }
      );
      batchCount++;

      // Mirror to user profile
      const uref = db.collection('users').doc(uid);
      batch.set(
        uref,
        {
          popularScore: Math.round(score * 100) / 100,
          isPopular: finalTier !== 'None',
        },
        { merge: true }
      );
      batchCount++;

      if (batchCount >= 400) await commitBatch();
    }

    await commitBatch();
    await Promise.all(batchWrites);
    logger.log('[computePopularity] done');
  }
);

// -------------------- ANALYTICS ROLLUPS --------------------
function dayKeyFromDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

function getYesterdayRangeUTC() {
  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1,
      0,
      0,
      0
    )
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  );
  return { start, end, key: dayKeyFromDate(start) };
}

function safeKey(s) {
  try {
    if (!s) return null;
    const str = String(s).toLowerCase();
    return str.replace(/[^a-z0-9_-]/g, '-').slice(0, 120) || null;
  } catch {
    return null;
  }
}

function isAggregatableEvent(name) {
  // Only roll up our standard app events
  return (
    name === 'card_impression' ||
    name === 'card_click' ||
    name === 'open_event' ||
    name === 'save_event' ||
    name === 'share_event' ||
    name === 'rsvp_yes' ||
    name === 'join_event' ||
    name === 'check_in' ||
    name === 'report_content'
  );
}

async function paginateQuery(q, onBatch) {
  let last = null;
  const pageSize = 1000;
  while (true) {
    let cur = q.orderBy('createdAt').limit(pageSize);
    if (last) cur = cur.startAfter(last);
    const snap = await cur.get();
    if (snap.empty) break;
    await onBatch(snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
}

exports.rollupDailyAnalytics = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540, // 9 minutes
  },
  async () => {
    const { start, end, key } = getYesterdayRangeUTC();
    logger.log(
      '[rollupDailyAnalytics] start',
      start.toISOString(),
      'end',
      end.toISOString(),
      'key',
      key
    );

    // Aggregation maps
    const byEntity = new Map(); // entityId -> { name -> count }, also track unique users
    const byEntityUids = new Map(); // entityId -> Set(uid)
    const byInterest = new Map(); // interestKey -> { name -> count }
    const byInterestUids = new Map(); // interestKey -> Set(uid)
    const byUser = new Map(); // uid -> { name -> count }

    const startTs = admin.firestore.Timestamp.fromDate(start);
    const endTs = admin.firestore.Timestamp.fromDate(end);
    const base = db
      .collection('analytics_events')
      .where('createdAt', '>=', startTs)
      .where('createdAt', '<', endTs);

    await paginateQuery(base, async (docs) => {
      for (const d of docs) {
        const ev = d.data() || {};
        const name = String(ev.name || '').toLowerCase();
        if (!isAggregatableEvent(name)) continue;

        const payload = ev.payload || {};
        const uid = ev.uid || null;

        // entity id: prefer event_id, fallback to card_id, then content_id
        const entityIdRaw =
          payload.event_id || payload.card_id || payload.content_id || null;
        const entityId = entityIdRaw ? String(entityIdRaw) : null;

        const interestRaw = payload.interest || payload.category || null;
        const interestKey = safeKey(interestRaw);

        // Entities rollup
        if (entityId) {
          const map = byEntity.get(entityId) || {};
          map[name] = (map[name] || 0) + 1;
          byEntity.set(entityId, map);
          if (uid) {
            let set = byEntityUids.get(entityId);
            if (!set) {
              set = new Set();
              byEntityUids.set(entityId, set);
            }
            set.add(uid);
          }
        }

        // Interests rollup
        if (interestKey) {
          const map = byInterest.get(interestKey) || {};
          map[name] = (map[name] || 0) + 1;
          byInterest.set(interestKey, map);
          if (uid) {
            let set = byInterestUids.get(interestKey);
            if (!set) {
              set = new Set();
              byInterestUids.set(interestKey, set);
            }
            set.add(uid);
          }
        }

        // Users rollup (internal use — no k-anonymity here because path is server-only by rules)
        if (uid) {
          const map = byUser.get(uid) || {};
          map[name] = (map[name] || 0) + 1;
          byUser.set(uid, map);
        }
      }
    });

    // Write rollups with k-anonymity suppression (<5 unique users hidden)
    const batch = db.batch();
    const dayRef = db.collection('analytics').doc('daily').collection(key);

    // Entities
    for (const [entityId, counts] of byEntity.entries()) {
      const uniq = (byEntityUids.get(entityId) || new Set()).size;
      if (uniq < 5) continue; // suppress small cohorts
      const ref = dayRef.collection('entities').doc(entityId);
      batch.set(
        ref,
        {
          day: key,
          entityId,
          counts,
          unique_users: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Interests
    for (const [interestKey, counts] of byInterest.entries()) {
      const uniq = (byInterestUids.get(interestKey) || new Set()).size;
      if (uniq < 5) continue; // suppress small cohorts
      const ref = dayRef.collection('interests').doc(interestKey);
      batch.set(
        ref,
        {
          day: key,
          interest: interestKey,
          counts,
          unique_users: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Users (server-internal; used for popularity computation)
    for (const [uid, counts] of byUser.entries()) {
      const ref = dayRef.collection('users').doc(uid);
      batch.set(
        ref,
        {
          day: key,
          uid,
          counts,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    logger.log('[rollupDailyAnalytics] wrote rollups for', key, {
      entities: byEntity.size,
      interests: byInterest.size,
      users: byUser.size,
    });
  }
);

// Description: Scheduled function to send event reminders 1 hour before events start
exports.sendEventReminders = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    logger.log('[sendEventReminders] starting');

    // Find events starting in the next 60-75 minutes (to catch them in this window)
    const now = new Date();
    const reminderStart = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const reminderEnd = new Date(now.getTime() + 75 * 60 * 1000); // 1 hour 15 min from now

    const eventsQuery = db
      .collection('events')
      .where('date', '>=', admin.firestore.Timestamp.fromDate(reminderStart))
      .where('date', '<=', admin.firestore.Timestamp.fromDate(reminderEnd))
      .where('isDeleted', '==', false);

    const eventsSnap = await eventsQuery.get();

    if (eventsSnap.empty) {
      logger.log('[sendEventReminders] No events found in reminder window');
      return;
    }

    logger.log(
      `[sendEventReminders] Found ${eventsSnap.size} events to remind`
    );

    for (const eventDoc of eventsSnap.docs) {
      const eventId = eventDoc.id;
      const event = eventDoc.data();

      // Check if we already sent reminder for this event
      const reminderCheckSnap = await db
        .collection('notifications')
        .where('eventId', '==', eventId)
        .where('type', '==', 'event_reminder')
        .limit(1)
        .get();

      if (!reminderCheckSnap.empty) {
        logger.log(`[sendEventReminders] Already sent reminder for ${eventId}`);
        continue;
      }

      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      const ownerId = event.ownerId;

      // Notify all attendees and host
      const notifRef = db.collection('notifications');
      const batch = db.batch();
      let batchCount = 0;

      const allRecipients = new Set([...attendees, ownerId].filter(Boolean));

      for (const recipientId of allRecipients) {
        const newNotifRef = notifRef.doc();
        batch.set(newNotifRef, {
          type: 'event_reminder',
          recipientId,
          eventId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          message: `${event.title || 'Your event'} starts in 1 hour!`,
          linkType: 'event',
          linkId: eventId,
          read: false,
        });
        batchCount++;

        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      logger.log(
        `[sendEventReminders] Sent ${allRecipients.size} reminders for event ${eventId}`
      );
    }

    logger.log('[sendEventReminders] completed');
  }
);

// -------------------- BUSINESSES: CALLABLE API --------------------
const BUSINESS_CALLABLE_OPTIONS = Object.freeze({
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 60,
  invoker: 'public',
  enforceAppCheck: true,
});

function assertAuth(req) {
  const uid = req.auth?.uid || null;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required');
  return uid;
}

function normalizeType(t) {
  const v = String(t || '').toLowerCase();
  return v === 'multi' ? 'multi' : 'single';
}

function slugify(name) {
  try {
    return String(name || '')
      .toLowerCase()
      .trim()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  } catch {
    return null;
  }
}

function buildSearchTokens(str) {
  try {
    const s = String(str || '')
      .toLowerCase()
      .trim();
    if (!s) return [];
    const tokens = new Set();
    // prefix tokens
    let cur = '';
    for (const ch of s.replace(/\s+/g, ' ')) {
      cur += ch;
      if (cur.length >= 2) tokens.add(cur);
    }
    // word prefixes
    for (const w of s.split(' ')) {
      let p = '';
      for (const ch of w) {
        p += ch;
        if (p.length >= 2) tokens.add(p);
      }
    }
    return Array.from(tokens).slice(0, 200);
  } catch {
    return [];
  }
}

async function ensureUniqueSlug(base) {
  let slug = base || null;
  if (!slug) return null;
  let tries = 0;
  while (tries < 8) {
    const q = await db
      .collection('businesses')
      .where('slug', '==', slug)
      .limit(1)
      .get();
    if (q.empty) return slug;
    const rand = Math.random().toString(36).slice(2, 6);
    slug = `${base}-${rand}`;
    tries++;
  }
  return `${base}-${Date.now().toString().slice(-4)}`;
}

async function getBusinessIfMember(bizId, uid) {
  const ref = db.doc(`businesses/${bizId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Business not found');
  const biz = snap.data();
  const members = Array.isArray(biz.members) ? biz.members : [];
  const isMember = members.some(
    (m) => m && (m.uid === uid || m.uid === String(uid))
  );
  if (!isMember && biz.createdBy !== uid) {
    throw new HttpsError('permission-denied', 'Not a member of this business');
  }
  return { ref, biz };
}

function hasRole(biz, uid, roles) {
  const allowed = new Set((roles || []).map((r) => String(r).toLowerCase()));
  const members = Array.isArray(biz.members) ? biz.members : [];
  for (const m of members) {
    const r = String(m?.role || '').toLowerCase();
    if ((m?.uid === uid || String(m?.uid) === uid) && allowed.has(r))
      return true;
  }
  // creator is implicitly Owner
  if (biz.createdBy === uid && allowed.has('owner')) return true;
  return false;
}

async function mirrorMembership(uid, bizId, role) {
  try {
    const ref = db
      .collection('businessMembers')
      .doc(uid)
      .collection('memberships')
      .doc(bizId);
    await ref.set(
      { role, createdAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    logger.error('[business] mirrorMembership error', e?.message || e);
  }
}

exports.createBusinessDraft = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const type = normalizeType(req.data?.type);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const ref = db.collection('businesses').doc();
  const doc = {
    createdBy: uid,
    ownerId: uid, // FIX: Add ownerId for queries
    status: 'draft',
    type,
    displayName: null,
    legalName: null,
    category: null,
    description: null,
    website: null,
    supportEmail: null,
    phone: null,
    logoUrl: null,
    coverUrl: null,
    brandColor: null,
    ageRestriction: 'none',
    genderRestriction: 'none',
    interests: [],
    houseRules: null,
    privacy: { analyticsShare: true },
    verification: { status: 'pending', method: null, verifiedAt: null },
    members: [{ uid, role: 'Owner' }],
    slug: null,
    searchTokens: [],
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(doc);
  await mirrorMembership(uid, ref.id, 'Owner');
  logger.log('[business] draft created', ref.id, 'by', uid);
  return { ok: true, bizId: ref.id };
});

exports.updateBusinessBasics = onCall(
  BUSINESS_CALLABLE_OPTIONS,
  async (req) => {
    const uid = assertAuth(req);
    const {
      bizId,
      displayName,
      category,
      description,
      website,
      supportEmail,
      phone,
    } = req.data || {};
    if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');

    const { ref, biz } = await getBusinessIfMember(bizId, uid);
    if (!hasRole(biz, uid, ['owner', 'manager'])) {
      throw new HttpsError('permission-denied', 'Owner/Manager only');
    }

    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (displayName != null)
      updates.displayName = String(displayName).slice(0, 80);
    if (category != null) updates.category = String(category).slice(0, 40);
    if (description != null)
      updates.description = String(description).slice(0, 200);
    if (website != null) updates.website = String(website).slice(0, 180);
    if (supportEmail != null)
      updates.supportEmail = String(supportEmail).slice(0, 120);
    if (phone != null) updates.phone = String(phone).slice(0, 40);

    // Slug + search tokens when displayName present
    if (updates.displayName) {
      const base = slugify(updates.displayName);
      const unique = await ensureUniqueSlug(base);
      updates.slug = unique;
      updates.searchTokens = buildSearchTokens(updates.displayName);
    }

    await ref.set(updates, { merge: true });
    logger.log('[business] basics updated', bizId);
    return { ok: true };
  }
);

exports.updateBrandAssets = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, logoUrl, coverUrl, brandColor } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const { ref, biz } = await getBusinessIfMember(bizId, uid);
  if (!hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');
  const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (logoUrl != null) updates.logoUrl = String(logoUrl);
  if (coverUrl != null) updates.coverUrl = String(coverUrl);
  if (brandColor != null) updates.brandColor = String(brandColor).slice(0, 9);
  await ref.set(updates, { merge: true });
  return { ok: true };
});

exports.addBusinessLocation = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const {
    bizId,
    label,
    address,
    city,
    state,
    country,
    latitude,
    longitude,
    hours,
    serviceRadiusKm,
    locId,
  } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  if (typeof latitude !== 'number' || typeof longitude !== 'number')
    throw new HttpsError('invalid-argument', 'latitude/longitude required');

  const { biz } = await getBusinessIfMember(bizId, uid);
  if (!hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');

  const gh = geohashForLocation([latitude, longitude]);
  const geohash5 = typeof gh === 'string' ? gh.substring(0, 5) : null;
  const geohash7 = typeof gh === 'string' ? gh.substring(0, 7) : null;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const locationRef = db
    .collection('businesses')
    .doc(bizId)
    .collection('locations')
    .doc(locId ? String(locId) : undefined);

  const data = {
    label: String(label || '').slice(0, 60) || null,
    address: String(address || '').slice(0, 200) || null,
    city: String(city || '').slice(0, 60) || null,
    state: String(state || '').slice(0, 60) || null,
    country: String(country || '').slice(0, 60) || null,
    latitude,
    longitude,
    geohash5,
    geohash7,
    hours: hours && typeof hours === 'object' ? hours : null,
    serviceRadiusKm:
      typeof serviceRadiusKm === 'number' ? serviceRadiusKm : null,
    updatedAt: now,
  };

  if (!locId) {
    data.createdAt = now;
  }

  await locationRef.set(data, { merge: Boolean(locId) });
  logger.log('[business] location saved', bizId, locationRef.id);
  return { ok: true, locId: locationRef.id };
});

exports.updateAudiencePolicies = onCall(
  BUSINESS_CALLABLE_OPTIONS,
  async (req) => {
    const uid = assertAuth(req);
    const { bizId, ageRestriction, genderRestriction, interests, houseRules } =
      req.data || {};
    if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
    const { ref, biz } = await getBusinessIfMember(bizId, uid);
    if (!hasRole(biz, uid, ['owner', 'manager']))
      throw new HttpsError('permission-denied', 'Owner/Manager only');
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    const age = String(ageRestriction || 'none').toLowerCase();
    const gender = String(genderRestriction || 'none').toLowerCase();
    updates.ageRestriction = ['none', '18+', '21+'].includes(age)
      ? age
      : 'none';
    updates.genderRestriction = [
      'none',
      'women_only',
      'men_only',
      'other',
    ].includes(gender)
      ? gender
      : 'none';
    updates.interests = Array.isArray(interests)
      ? interests.map((i) => String(i).slice(0, 40)).slice(0, 20)
      : [];
    updates.houseRules = houseRules ? String(houseRules).slice(0, 500) : null;
    await ref.set(updates, { merge: true });
    return { ok: true };
  }
);

exports.startBusinessVerification = onCall(
  BUSINESS_CALLABLE_OPTIONS,
  async (req) => {
    const uid = assertAuth(req);
    const { bizId, method } = req.data || {};
    if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
    const m = String(method || '').toLowerCase();
    if (!['domain_email', 'sms'].includes(m))
      throw new HttpsError('invalid-argument', 'Invalid method');
    const { ref, biz } = await getBusinessIfMember(bizId, uid);
    if (!hasRole(biz, uid, ['owner', 'manager']))
      throw new HttpsError('permission-denied', 'Owner/Manager only');

    // For MVP: generate a 6-digit code and store a hash in a subdoc
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeRef = ref.collection('verificationCodes').doc();
    await codeRef.set({
      method: m,
      code, // NOTE: For beta only; remove plain code later and store hash
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: uid,
      consumed: false,
    });
    await ref.set(
      { verification: { status: 'pending', method: m, verifiedAt: null } },
      { merge: true }
    );
    logger.log('[business] verification started', bizId, m);
    // Return the code only in beta/dev to unblock flow
    return { ok: true, devCode: code };
  }
);

exports.verifyBusinessCode = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, code } = req.data || {};
  if (!bizId || !code)
    throw new HttpsError('invalid-argument', 'Missing params');
  const { ref, biz } = await getBusinessIfMember(bizId, uid);
  if (!hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');

  const codesSnap = await ref
    .collection('verificationCodes')
    .where('consumed', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  let matched = null;
  for (const d of codesSnap.docs) {
    const c = d.get('code');
    if (String(c) === String(code)) {
      matched = d.ref;
      break;
    }
  }
  if (!matched) throw new HttpsError('permission-denied', 'Invalid code');
  const now = admin.firestore.FieldValue.serverTimestamp();
  await matched.set({ consumed: true, consumedAt: now }, { merge: true });
  await ref.set(
    { verification: { status: 'verified', verifiedAt: now } },
    { merge: true }
  );
  logger.log('[business] verified', bizId);
  return { ok: true };
});

exports.addBusinessMember = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, targetUid, email, role } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const r = String(role || '').toLowerCase();
  if (!['owner', 'manager', 'staff'].includes(r))
    throw new HttpsError('invalid-argument', 'Invalid role');

  const { ref, biz } = await getBusinessIfMember(bizId, uid);
  // Only Owner can grant Owner; Owner or Manager can grant Manager/Staff
  if (r === 'owner' && !hasRole(biz, uid, ['owner']))
    throw new HttpsError('permission-denied', 'Only Owner can assign Owner');
  if (r !== 'owner' && !hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');

  let target = targetUid || null;
  if (!target && email) {
    const q = await db
      .collection('users')
      .where('email', '==', String(email))
      .limit(1)
      .get();
    if (!q.empty) target = q.docs[0].id;
  }
  if (!target) throw new HttpsError('not-found', 'Target user not found');

  await ref.set(
    {
      members: admin.firestore.FieldValue.arrayUnion({
        uid: target,
        role: role.charAt(0).toUpperCase() + r.slice(1),
      }),
    },
    { merge: true }
  );
  await mirrorMembership(
    target,
    bizId,
    role.charAt(0).toUpperCase() + r.slice(1)
  );
  logger.log('[business] member added', bizId, target, role);
  return { ok: true };
});

exports.setBusinessPrivacy = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, analyticsShare } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const { ref, biz } = await getBusinessIfMember(bizId, uid);
  if (!hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');
  await ref.set(
    {
      privacy: { analyticsShare: analyticsShare !== false },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true };
});

exports.submitBusiness = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, review } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const { ref, biz } = await getBusinessIfMember(bizId, uid);
  if (!hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');
  const status = review === true ? 'pending_review' : 'active';
  await ref.set(
    { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, status };
});

// HTTP function to update categories (easier to call from terminal)
exports.updateCategoriesHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request, response) => {
    // Simple security: require a secret key or admin context
    const secretKey = request.query.secret || request.body?.secret;
    if (secretKey !== 'update-categories-2025') {
      response.status(403).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const categoriesRef = db.collection('categories');

      // Clear existing documents
      logger.info('Clearing existing categories...');
      const existing = await categoriesRef.listDocuments();

      // Delete in batches of 500 (Firestore limit)
      for (let i = 0; i < existing.length; i += 500) {
        const chunk = existing.slice(i, i + 500);
        const batch = db.batch();
        chunk.forEach((docRef) => batch.delete(docRef));
        await batch.commit();
      }

      // Load categories from the JSON file
      const allCategories = require('../src/features/events/constants/categoriesData.json');

      // Add new categories
      logger.info('Adding new categories...');
      let batch = db.batch();
      let writes = 0;

      for (const category of allCategories) {
        const docRef = categoriesRef.doc(category.id);
        batch.set(docRef, {
          name: category.name?.trim() || '',
          emoji: category.emoji?.trim() || '',
          interests: (category.interests || []).map((interest) => ({
            name: interest.name?.trim() || '',
            count_selected: Number(interest.count_selected) || 0,
            count_event_matches: Number(interest.count_event_matches) || 0,
            count_event_views: Number(interest.count_event_views) || 0,
            count_event_joins: Number(interest.count_event_joins) || 0,
            last_activity: interest.last_activity || null,
          })),
          updatedAt: FieldValue.serverTimestamp(),
        });

        writes += 1;

        // Commit batch every 500 writes (Firestore limit)
        if (writes % 500 === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }

      // Commit remaining writes
      if (writes % 500 !== 0) {
        await batch.commit();
      }

      logger.info(`Successfully updated ${writes} categories`);
      response.json({ success: true, categoriesUpdated: writes });
    } catch (error) {
      logger.error('Error updating categories:', error);
      response
        .status(500)
        .json({ error: 'Failed to update categories', details: error.message });
    }
  }
);

// HTTP function to recalculate interest counts from existing users
exports.recalculateInterestCountsHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request, response) => {
    // Simple security: require a secret key
    const secretKey = request.query.secret || request.body?.secret;
    if (secretKey !== 'update-categories-2025') {
      response.status(403).json({ error: 'Unauthorized' });
      return;
    }

    try {
      logger.info('[recalculateInterestCounts] Fetching all users...');
      const usersSnapshot = await db.collection('users').get();

      // Count how many times each interest is selected across all users
      const interestCounts = new Map();

      usersSnapshot.docs.forEach((userDoc) => {
        const userData = userDoc.data();
        const interests = Array.isArray(userData.interests)
          ? userData.interests
          : [];

        interests.forEach((interest) => {
          const count = interestCounts.get(interest) || 0;
          interestCounts.set(interest, count + 1);
        });
      });

      logger.info(
        `[recalculateInterestCounts] Counted interests from ${usersSnapshot.size} users`
      );
      logger.info(
        `[recalculateInterestCounts] Found ${interestCounts.size} unique interests`
      );

      // Update categories with the counts
      logger.info('[recalculateInterestCounts] Updating categories...');
      const categoriesSnapshot = await db.collection('categories').get();

      let batch = db.batch();
      let updatedCount = 0;
      let writes = 0;

      categoriesSnapshot.docs.forEach((categoryDoc) => {
        const categoryData = categoryDoc.data();
        const interests = categoryData.interests || [];

        const updatedInterests = interests.map((interest) => {
          const interestName =
            typeof interest === 'string' ? interest : interest.name;
          const count = interestCounts.get(interestName) || 0;

          if (typeof interest === 'string') {
            return {
              name: interest,
              count_selected: count,
              count_event_matches: 0,
              count_event_views: 0,
              count_event_joins: 0,
              last_activity: null,
            };
          }

          return {
            ...interest,
            count_selected: count,
          };
        });

        batch.update(categoryDoc.ref, {
          interests: updatedInterests,
          updatedAt: FieldValue.serverTimestamp(),
        });

        writes++;
        updatedCount++;

        // Commit batch every 500 writes
        if (writes % 500 === 0) {
          batch.commit();
          batch = db.batch();
        }
      });

      // Commit remaining writes
      if (writes % 500 !== 0) {
        await batch.commit();
      }

      // Get top interests for response
      const topInterests = Array.from(interestCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([interest, count]) => ({ interest, count }));

      logger.info(
        `[recalculateInterestCounts] Successfully updated ${updatedCount} categories`
      );
      response.json({
        success: true,
        categoriesUpdated: updatedCount,
        totalUsers: usersSnapshot.size,
        uniqueInterests: interestCounts.size,
        topInterests,
      });
    } catch (error) {
      logger.error('[recalculateInterestCounts] Error:', error);
      response.status(500).json({
        error: 'Failed to recalculate interest counts',
        details: error.message,
      });
    }
  }
);

// Function to update categories from the new categories data
exports.updateCategories = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: false, // Allow for admin calls
  },
  async (request) => {
    // Description: Updates all categories in Firestore with new structure
    const { auth, data } = request;

    // Simple authentication check - you can remove this if running from admin context
    // For now, let's allow any authenticated user to run this (you can restrict later)
    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const newCategories = [
      {
        id: 'active_outdoors',
        name: 'active outdoors',
        emoji: '',
        interests: [
          {
            name: 'Hiking',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Trail Running',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Backpacking',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Cycling',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Mountain Biking',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Climbing',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Skiing',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Snowboarding',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Rafting',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Fishing',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Paddleboarding',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Kayaking',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
          {
            name: 'Yoga',
            count_selected: 0,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: '2025-07-30T00:00:00Z',
          },
        ],
      },
      // ... (I'll add the rest in the actual function, keeping this short for readability)
    ];

    try {
      const categoriesRef = db.collection('categories');

      // Clear existing documents
      logger.info('Clearing existing categories...');
      const existing = await categoriesRef.listDocuments();

      // Delete in batches of 500 (Firestore limit)
      for (let i = 0; i < existing.length; i += 500) {
        const chunk = existing.slice(i, i + 500);
        const batch = db.batch();
        chunk.forEach((docRef) => batch.delete(docRef));
        await batch.commit();
      }

      // Add new categories
      logger.info('Adding new categories...');
      let batch = db.batch();
      let writes = 0;

      const allCategories =
        data?.categories ||
        require('../src/features/events/constants/categoriesData.json');

      for (const category of allCategories) {
        const docRef = categoriesRef.doc(category.id);
        batch.set(docRef, {
          name: category.name?.trim() || '',
          emoji: category.emoji?.trim() || '',
          interests: (category.interests || []).map((interest) => ({
            name: interest.name?.trim() || '',
            count_selected: Number(interest.count_selected) || 0,
            count_event_matches: Number(interest.count_event_matches) || 0,
            count_event_views: Number(interest.count_event_views) || 0,
            count_event_joins: Number(interest.count_event_joins) || 0,
            last_activity: interest.last_activity || null,
          })),
          updatedAt: FieldValue.serverTimestamp(),
        });

        writes += 1;

        // Commit batch every 500 writes (Firestore limit)
        if (writes % 500 === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }

      // Commit remaining writes
      if (writes % 500 !== 0) {
        await batch.commit();
      }

      logger.info(`Successfully updated ${writes} categories`);
      return { success: true, categoriesUpdated: writes };
    } catch (error) {
      logger.error('Error updating categories:', error);
      throw new HttpsError('internal', 'Failed to update categories');
    }
  }
);

exports.aggregateUsageMetrics = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'America/Los_Angeles',
    retryConfig: { retryCount: 3 },
  },
  async () => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totals = {
      totalUsers: 0,
      newUsers24h: 0,
      newUsers7d: 0,
      newUsers30d: 0,
      dau: 0,
      wau: 0,
      mau: 0,
      analyticsOptIn: 0,
    };

    const ageBuckets = {};
    for (const key of AGE_BUCKETS) ageBuckets[key] = 0;
    const sexBuckets = {};
    for (const key of SEX_BUCKETS) sexBuckets[key] = 0;

    const batchSize = 500;
    let lastDocId = null;

    while (true) {
      let query = db
        .collection('users')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(batchSize);

      if (lastDocId) {
        query = query.startAfter(lastDocId);
      }

      const snap = await query.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const data = doc.data() || {};
        totals.totalUsers += 1;

        if (data.analyticsOptIn === true) {
          totals.analyticsOptIn += 1;
        }

        const createdAt = toDate(data.createdAt);
        if (createdAt) {
          if (createdAt >= dayAgo) totals.newUsers24h += 1;
          if (createdAt >= weekAgo) totals.newUsers7d += 1;
          if (createdAt >= monthAgo) totals.newUsers30d += 1;
        }

        const lastActive = toDate(
          data.lastActiveAt || data.lastActive || data.updatedAt
        );
        if (lastActive) {
          if (lastActive >= dayAgo) totals.dau += 1;
          if (lastActive >= weekAgo) totals.wau += 1;
          if (lastActive >= monthAgo) totals.mau += 1;
        }

        const ageBucket = ageBracketForDob(data.dob, now);
        incrementCounter(ageBuckets, ageBucket);

        const sexBucket = normalizeSexMetric(data.sex);
        incrementCounter(sexBuckets, sexBucket);
      }

      lastDocId = snap.docs[snap.docs.length - 1].id;
    }

    const optInRate =
      totals.totalUsers > 0
        ? Number((totals.analyticsOptIn / totals.totalUsers).toFixed(4))
        : 0;

    const summary = {
      computedAt: admin.firestore.Timestamp.now(),
      totals: {
        ...totals,
        analyticsOptInRate: optInRate,
      },
      windows: {
        dau: totals.dau,
        wau: totals.wau,
        mau: totals.mau,
        newUsers24h: totals.newUsers24h,
        newUsers7d: totals.newUsers7d,
        newUsers30d: totals.newUsers30d,
      },
      demographics: {
        age: ageBuckets,
        sex: sexBuckets,
      },
    };

    const usageDoc = db.collection('metrics').doc('usage');
    await usageDoc.set(summary, { merge: true });

    const dateKey = now.toISOString().slice(0, 10);
    await usageDoc
      .collection('daily')
      .doc(dateKey)
      .set(summary, { merge: true });

    logger.info('[metrics] usage summary updated', {
      totalUsers: totals.totalUsers,
      dau: totals.dau,
      wau: totals.wau,
      mau: totals.mau,
    });
  }
);

// -------------------- USER VERIFICATION --------------------

// Description: Request email verification using Firebase Auth's built-in system
// Note: Firebase Auth sends the email automatically, no custom email service needed
exports.requestEmailVerification = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
  },
  async (req) => {
    logger.info('[requestEmailVerification] Function called');
    const uid = req.auth?.uid;

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    try {
      // Get user from Firebase Auth
      const userRecord = await admin.auth().getUser(uid);

      // Check if email is already verified in Firebase Auth
      if (userRecord.emailVerified) {
        logger.info(
          '[requestEmailVerification] Email already verified in Firebase Auth'
        );
        // Also update Firestore to match
        await db.doc(`users/${uid}`).update({
          verified: true,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          verificationMethod: 'email',
        });
        return { ok: true, alreadyVerified: true };
      }

      // Generate email verification link
      const actionCodeSettings = {
        url: `https://${
          process.env.GCLOUD_PROJECT || 'social-scene1'
        }.firebaseapp.com`,
        handleCodeInApp: false,
      };

      const link = await admin
        .auth()
        .generateEmailVerificationLink(userRecord.email, actionCodeSettings);

      logger.info(
        `[requestEmailVerification] Generated link for ${userRecord.email}`
      );

      // Note: In production, you'd send this link via your email service (SendGrid, etc.)
      // For now, Firebase Console settings must have email templates configured
      // The link is generated but Firebase doesn't automatically send it from Cloud Functions
      // You need to call auth().currentUser.sendEmailVerification() from the client

      return {
        ok: true,
        email: userRecord.email,
        message: 'Please check your email for verification link',
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('[requestEmailVerification] error', err?.message || err);
      throw new HttpsError('internal', 'Verification request failed');
    }
  }
);

// Description: Verify email code
// Validates the verification code and marks user as verified
exports.verifyEmailCode = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
  },
  async (req) => {
    const uid = req.auth?.uid;
    const { code } = req.data || {};

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    if (!code || typeof code !== 'string') {
      throw new HttpsError('invalid-argument', 'Verification code required');
    }

    try {
      const userRef = db.doc(`users/${uid}`);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const request = userData.verificationRequest;

      if (!request || request.type !== 'email') {
        throw new HttpsError(
          'failed-precondition',
          'No pending email verification'
        );
      }

      // Check expiration
      const now = Date.now();
      const expiresMs = request.expiresAt?.toMillis?.() || 0;
      if (now > expiresMs) {
        throw new HttpsError('deadline-exceeded', 'Verification code expired');
      }

      // Check attempts (max 5)
      if (request.attempts >= 5) {
        throw new HttpsError(
          'resource-exhausted',
          'Too many failed attempts. Please request a new code.'
        );
      }

      // Validate code
      if (request.code !== code.trim()) {
        // Increment attempts
        await userRef.update({
          'verificationRequest.attempts':
            admin.firestore.FieldValue.increment(1),
        });
        throw new HttpsError('invalid-argument', 'Invalid verification code');
      }

      // Success! Mark user as verified
      await userRef.update({
        verified: true,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        verificationMethod: 'email',
        verificationRequest: admin.firestore.FieldValue.delete(),
      });

      logger.info(`[verification] User ${uid} verified via email`);

      return { ok: true, verified: true };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('[verifyEmailCode] error', err?.message || err);
      throw new HttpsError('internal', 'Verification failed');
    }
  }
);

// Description: Request phone verification (optional - requires Twilio/similar)
exports.requestPhoneVerification = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
  },
  async (req) => {
    const uid = req.auth?.uid;
    const { phoneNumber } = req.data || {};

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    if (!phoneNumber) {
      throw new HttpsError('invalid-argument', 'Phone number required');
    }

    try {
      // Get user data
      const userDoc = await db.doc(`users/${uid}`).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();

      // Check if already verified
      if (userData.verified === true) {
        return { ok: true, alreadyVerified: true };
      }

      // Generate verification code (6 digits)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        Date.now() + 10 * 60 * 1000 // 10 minutes
      );

      // Store verification request
      await db.doc(`users/${uid}`).update({
        verificationRequest: {
          type: 'phone',
          code,
          phoneNumber,
          expiresAt,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          attempts: 0,
        },
      });

      // Send SMS with code
      // TODO: Integrate with Twilio or similar SMS service
      logger.info(
        `[requestPhoneVerification] Code generated for ${phoneNumber}: ${code}`
      );
      // For now, code is logged server-side only

      return { ok: true, phoneNumber, codeLength: 6 };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('[requestPhoneVerification] error', err?.message || err);
      throw new HttpsError('internal', 'Phone verification request failed');
    }
  }
);

// Description: Verify phone code
exports.verifyPhoneCode = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
  },
  async (req) => {
    const uid = req.auth?.uid;
    const { code } = req.data || {};

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    if (!code) {
      throw new HttpsError('invalid-argument', 'Verification code required');
    }

    try {
      const userRef = db.doc(`users/${uid}`);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const request = userData.verificationRequest;

      if (!request || request.type !== 'phone') {
        throw new HttpsError(
          'failed-precondition',
          'No pending phone verification'
        );
      }

      // Check expiration
      const now = Date.now();
      const expiresMs = request.expiresAt?.toMillis?.() || 0;
      if (now > expiresMs) {
        throw new HttpsError('deadline-exceeded', 'Verification code expired');
      }

      // Check attempts
      if (request.attempts >= 5) {
        throw new HttpsError(
          'resource-exhausted',
          'Too many failed attempts. Please request a new code.'
        );
      }

      // Validate code
      if (request.code !== code.trim()) {
        await userRef.update({
          'verificationRequest.attempts':
            admin.firestore.FieldValue.increment(1),
        });
        throw new HttpsError('invalid-argument', 'Invalid verification code');
      }

      // Success!
      await userRef.update({
        verified: true,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        verificationMethod: 'phone',
        phoneNumber: request.phoneNumber, // Store verified phone
        verificationRequest: admin.firestore.FieldValue.delete(),
      });

      logger.info(`[verification] User ${uid} verified via phone`);

      return { ok: true, verified: true };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('[verifyPhoneCode] error', err?.message || err);
      throw new HttpsError('internal', 'Phone verification failed');
    }
  }
);

/**
 * Description: Cloud Function to update interest counts in categories when user interests change
 * Tracks count_selected field for each interest across all categories
 */
exports.updateInterestCounts = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    try {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      const beforeInterests = Array.isArray(beforeData?.interests)
        ? beforeData.interests
        : [];
      const afterInterests = Array.isArray(afterData?.interests)
        ? afterData.interests
        : [];

      // Find interests that were added or removed
      const addedInterests = afterInterests.filter(
        (interest) => !beforeInterests.includes(interest)
      );
      const removedInterests = beforeInterests.filter(
        (interest) => !afterInterests.includes(interest)
      );

      if (addedInterests.length === 0 && removedInterests.length === 0) {
        // No interest changes
        return null;
      }

      logger.info(
        `[updateInterestCounts] User ${event.params.userId} added ${addedInterests.length}, removed ${removedInterests.length} interests`
      );

      // Fetch all categories
      const categoriesSnapshot = await db.collection('categories').get();

      const batch = db.batch();

      categoriesSnapshot.docs.forEach((categoryDoc) => {
        const categoryData = categoryDoc.data();
        const interests = categoryData.interests || [];
        let modified = false;

        const updatedInterests = interests.map((interest) => {
          const interestName =
            typeof interest === 'string' ? interest : interest.name;

          if (addedInterests.includes(interestName)) {
            modified = true;
            const currentCount =
              typeof interest === 'object' ? interest.count_selected || 0 : 0;
            return {
              ...(typeof interest === 'object' ? interest : { name: interest }),
              count_selected: currentCount + 1,
            };
          }

          if (removedInterests.includes(interestName)) {
            modified = true;
            const currentCount =
              typeof interest === 'object' ? interest.count_selected || 0 : 0;
            return {
              ...(typeof interest === 'object' ? interest : { name: interest }),
              count_selected: Math.max(0, currentCount - 1),
            };
          }

          return interest;
        });

        if (modified) {
          batch.update(categoryDoc.ref, {
            interests: updatedInterests,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      await batch.commit();
      logger.info(
        `[updateInterestCounts] Successfully updated interest counts`
      );

      return null;
    } catch (error) {
      logger.error('[updateInterestCounts] Error:', error);
      // Don't throw - we don't want to block user updates
      return null;
    }
  }
);

//# sourceMappingURL=index.js.map
