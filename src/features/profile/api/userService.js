// Description: Check for soft-deleted user by email and offer reactivation
import { db, serverTimestamp } from '../../../services/firebase/config';
import { geohashForLocation } from 'geofire-common';
import { track as trackClient } from '../../../lib/analytics';
import { DEFAULT_BADGE } from '../utils/badgeConfig';
import logger from '../../../lib/logger';

/**
 * Checks if a user with the given email exists and is soft-deleted.
 * If found, returns the user document reference and data.
 */
export async function findSoftDeletedUserByEmail(email) {
  logger.debug('[userService] Checking for soft-deleted user by email:', email);
  trackClient('user_soft_deleted_check', {});
  const q = db
    .collection('users')
    .where('email', '==', email)
    .where('isDeleted', '==', true);
  const snap = await q.get();
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    logger.debug('[userService] Soft-deleted user found:', docSnap.id);
    trackClient('user_soft_deleted_found', {});
    return { ref: docSnap.ref, data: docSnap.data(), id: docSnap.id };
  }
  logger.debug('[userService] No soft-deleted user found for:', email);
  trackClient('user_soft_deleted_not_found', {});
  return null;
}

/**
 * Reactivates a soft-deleted user account by resetting isDeleted and deletedAt, and optionally updating fields.
 * Also re-enables the Auth user if disabled (via a callable cloud function).
 */
import { functions as firebaseFunctions } from '../../../services/firebase/config';

export async function reactivateUser(userId, updates = {}) {
  const userRef = db.collection('users').doc(userId);
  logger.debug('[userService] Reactivating user:', userId, updates);
  trackClient('user_reactivate_attempt', {});
  await userRef.update({
    isDeleted: false,
    deletedAt: null,
    ...updates,
  });
  // Call a callable function to re-enable the Auth user
  try {
    const enableUser = firebaseFunctions.httpsCallable('enableAuthUser');
    await enableUser({ uid: userId });
    logger.debug(
      '[userService] Called enableAuthUser cloud function for:',
      userId
    );
    trackClient('user_reactivate_callable_ok', {});
  } catch (e) {
    // If the function doesn't exist or fails, ignore (user will be enabled by Firestore trigger if possible)
    logger.warn('Could not re-enable Auth user:', e.message);
  }
}

// Description: Fetch user data by user ID from Firestore
export async function getUserById(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      // Restrict access for soft-deleted users
      if (userData.isDeleted) {
        // Optionally log or handle deleted user access
        return null;
      }
      return {
        ...userData,
        rating: userData.rating || 0, // Ensure rating is included, default to 0
      };
    } else {
      logger.warn(`User with ID ${userId} not found.`);
    }
  } catch (error) {
    logger.error('Error fetching user data:', error);
  }
  return null;
}

// Helper: compute a coarse 5-character geohash from lat/lng
function coarseGeohash5(lat, lng) {
  try {
    const full = geohashForLocation([lat, lng]);
    return typeof full === 'string' ? full.substring(0, 5) : null;
  } catch {
    return null;
  }
}

// Description: Creates a new user document with all required fields and defaults
// filepath: src/services/userService.js

const CLIENT_RESTRICTED_USER_KEYS = [
  'premiumTier',
  'premiumSince',
  'premiumUntil',
  'popularScore',
  'businessTier',
  'plan',
  'type',
];

function isTimestampLike(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.toDate === 'function' &&
    typeof value.toMillis === 'function' &&
    typeof value.seconds === 'number' &&
    typeof value.nanoseconds === 'number'
  );
}

function isGeoPointLike(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    typeof value.isEqual === 'function'
  );
}

function stripUnsupportedFirestoreValues(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;

  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (
    value instanceof Date ||
    isTimestampLike(value) ||
    isGeoPointLike(value)
  ) {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    typeof value._methodName === 'string'
  ) {
    // FieldValue sentinel (e.g., serverTimestamp, arrayUnion, etc.)
    return value;
  }

  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => stripUnsupportedFirestoreValues(item))
      .filter((item) => item !== undefined);
    return cleaned;
  }

  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const cleaned = stripUnsupportedFirestoreValues(nested);
      if (cleaned !== undefined) {
        out[key] = cleaned;
      }
    }
    return out;
  }

  return undefined;
}

function sanitizeUserPayload(data = {}) {
  const clone = { ...data };
  for (const key of CLIENT_RESTRICTED_USER_KEYS) {
    if (key in clone) delete clone[key];
  }
  return stripUnsupportedFirestoreValues(clone);
}

function normalizeDeviceToken(token) {
  if (typeof token !== 'string') return null;
  return /^ExponentPushToken/.test(token) ? token : null;
}

export async function createUser(uid, userData = {}) {
  const sanitizedInput = sanitizeUserPayload(userData);

  const defaultUser = {
    type: 'user',
    email: '',
    firstName: '',
    lastName: '',
    dob: null,
    sex: '',
    interests: [],
    location: { latitude: null, longitude: null },
    bio: '',
    profileImage: '',
    status: 'active',
    verified: false,
    attendedEvents: [],
    createdEvents: [],
    followerCount: 0,
    followingCount: 0,
    ratings: {},
    rating: 0, // Initialize average rating to 0
    ratingCount: 0, // Initialize rating count to 0
    savedCount: 0,
    referralCode: '',
    referredBy: '',
    blocked: [],
    blockedBy: [],
    coarseGeohash5: null,
    premiumActive: false,
    isPopular: false,
    deviceToken: null,
    pushOptIn: false,
    analyticsOptIn: null, // null signals "no decision" for consent prompt logic
    analyticsUpdatedAt: null,
    analyticsPromptedAt: null,
    analyticsConsentVersion: null,
    isDeleted: false,
    deletedAt: null,
    // Badge system fields
    badges: [DEFAULT_BADGE], // Array of earned badge IDs
    currentBadge: DEFAULT_BADGE, // Currently displayed badge
  };

  let coarse = null;
  try {
    const lat = sanitizedInput?.location?.latitude;
    const lng = sanitizedInput?.location?.longitude;
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !Number.isNaN(lat) &&
      !Number.isNaN(lng)
    ) {
      coarse = coarseGeohash5(lat, lng);
    }
  } catch {}

  const now = serverTimestamp();
  const deviceToken = normalizeDeviceToken(sanitizedInput.deviceToken);
  const payload = stripUnsupportedFirestoreValues({
    ...defaultUser,
    ...sanitizedInput,
    email: sanitizedInput.email ?? defaultUser.email,
    deviceToken,
    pushOptIn: deviceToken ? true : Boolean(sanitizedInput.pushOptIn),
    createdAt: sanitizedInput.createdAt ?? now,
    lastActive: sanitizedInput.lastActive ?? now,
    coarseGeohash5: coarse ?? defaultUser.coarseGeohash5,
  });

  const minimalFallback = stripUnsupportedFirestoreValues({
    type: 'user',
    email: payload.email,
    premiumActive: false,
    isPopular: false,
    status: 'active',
    verified: false,
    pushOptIn: payload.pushOptIn,
    deviceToken,
    createdAt: now,
    lastActive: now,
    isDeleted: false,
    deletedAt: null,
    analyticsOptIn: payload?.analyticsOptIn ?? null,
    analyticsUpdatedAt: payload?.analyticsUpdatedAt ?? null,
    analyticsPromptedAt: payload?.analyticsPromptedAt ?? null,
    analyticsConsentVersion: payload?.analyticsConsentVersion ?? null,
  });

  logger.debug('[userService] Creating user in Firestore:', uid, sanitizedInput);
  try {
    await db.collection('users').doc(uid).set(payload, { merge: true });
  } catch (err) {
    if (err?.code === 'permission-denied') {
      logger.warn(
        '[userService] Primary createUser denied, attempting minimal fallback',
        err?.message || err
      );
      await db
        .collection('users')
        .doc(uid)
        .set(minimalFallback, { merge: true });
    } else {
      throw err;
    }
  }
  logger.debug('[userService] User created in Firestore:', uid);
}

export async function mergeUserFields(uid, data = {}) {
  if (!uid) return;
  const sanitizedInput = sanitizeUserPayload(data);
  const patch = { ...sanitizedInput };

  if ('deviceToken' in patch) {
    patch.deviceToken = normalizeDeviceToken(patch.deviceToken);
  }
  if ('pushOptIn' in patch) {
    patch.pushOptIn = !!patch.pushOptIn;
  }

  const basePayload = {
    type: 'user',
    premiumActive: false,
    isPopular: false,
    status: 'active',
    verified: false,
    isDeleted: false,
    deletedAt: null,
  };

  if ('deviceToken' in patch) {
    basePayload.deviceToken = patch.deviceToken;
  }
  if ('pushOptIn' in patch) {
    basePayload.pushOptIn = patch.pushOptIn;
  }

  try {
    await db.collection('users').doc(uid).set(patch, { merge: true });
  } catch (err) {
    if (err?.code === 'permission-denied') {
      await db.collection('users').doc(uid).set(basePayload, { merge: true });
      if (Object.keys(patch).length > 0) {
        await db.collection('users').doc(uid).set(patch, { merge: true });
      }
    } else {
      throw err;
    }
  }
}

// Description: Internal exports for unit testing sanitization logic
export const __userServiceInternals = {
  stripUnsupportedFirestoreValues,
  sanitizeUserPayload,
};

// Description: Update user location and persist coarse geohash-5 + optional city/postalCode
export async function updateUserLocation(
  uid,
  { latitude, longitude, city, postalCode } = {}
) {
  if (!uid) return;
  const patch = {};
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    patch.location = { latitude, longitude };
    patch.coarseGeohash5 = coarseGeohash5(latitude, longitude);
  }
  if (city) patch.city = city;
  if (postalCode) patch.postalCode = postalCode;

  if (Object.keys(patch).length === 0) return;

  await db.collection('users').doc(uid).update(patch);
}
