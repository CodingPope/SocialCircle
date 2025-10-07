// Description: Check for soft-deleted user by email and offer reactivation
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { geohashForLocation } from 'geofire-common';
import { track as trackClient } from '../../../lib/analytics';
import { DEFAULT_BADGE } from '../utils/badgeConfig';

/**
 * Checks if a user with the given email exists and is soft-deleted.
 * If found, returns the user document reference and data.
 */
export async function findSoftDeletedUserByEmail(email) {
  const db = getFirestore();
  console.log('[userService] Checking for soft-deleted user by email:', email);
  trackClient('user_soft_deleted_check', {});
  const q = query(
    collection(db, 'users'),
    where('email', '==', email),
    where('isDeleted', '==', true)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    console.log('[userService] Soft-deleted user found:', docSnap.id);
    trackClient('user_soft_deleted_found', {});
    return { ref: docSnap.ref, data: docSnap.data(), id: docSnap.id };
  }
  console.log('[userService] No soft-deleted user found for:', email);
  trackClient('user_soft_deleted_not_found', {});
  return null;
}

/**
 * Reactivates a soft-deleted user account by resetting isDeleted and deletedAt, and optionally updating fields.
 * Also re-enables the Auth user if disabled (via a callable cloud function).
 */
import { httpsCallable } from 'firebase/functions';
import { functions as firebaseFunctions } from '../../../firebase/config';

export async function reactivateUser(userId, updates = {}) {
  const db = getFirestore();
  const userRef = doc(db, 'users', userId);
  console.log('[userService] Reactivating user:', userId, updates);
  trackClient('user_reactivate_attempt', {});
  await updateDoc(userRef, {
    isDeleted: false,
    deletedAt: null,
    ...updates,
  });
  // Call a callable function to re-enable the Auth user
  try {
    const enableUser = httpsCallable(firebaseFunctions, 'enableAuthUser');
    await enableUser({ uid: userId });
    console.log(
      '[userService] Called enableAuthUser cloud function for:',
      userId
    );
    trackClient('user_reactivate_callable_ok', {});
  } catch (e) {
    // If the function doesn't exist or fails, ignore (user will be enabled by Firestore trigger if possible)
    console.warn('Could not re-enable Auth user:', e.message);
  }
}

// Description: Fetch user data by user ID from Firestore
export async function getUserById(userId) {
  try {
    const db = getFirestore();
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
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
      console.warn(`User with ID ${userId} not found.`);
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
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

function sanitizeUserPayload(data = {}) {
  const clone = { ...data };
  for (const key of CLIENT_RESTRICTED_USER_KEYS) {
    if (key in clone) delete clone[key];
  }
  return clone;
}

function normalizeDeviceToken(token) {
  if (typeof token !== 'string') return null;
  return /^ExponentPushToken/.test(token) ? token : null;
}

export async function createUser(uid, userData = {}) {
  const db = getFirestore();
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
    analyticsOptIn: true, // Default to enabled (user can opt-out in Privacy settings)
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
  const payload = {
    ...defaultUser,
    ...sanitizedInput,
    email: sanitizedInput.email ?? defaultUser.email,
    deviceToken,
    pushOptIn: deviceToken ? true : Boolean(sanitizedInput.pushOptIn),
    createdAt: sanitizedInput.createdAt ?? now,
    lastActive: sanitizedInput.lastActive ?? now,
    coarseGeohash5: coarse ?? defaultUser.coarseGeohash5,
  };

  const minimalFallback = {
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
  };

  console.log('[userService] Creating user in Firestore:', uid, sanitizedInput);
  try {
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
  } catch (err) {
    if (err?.code === 'permission-denied') {
      console.warn(
        '[userService] Primary createUser denied, attempting minimal fallback',
        err?.message || err
      );
      await setDoc(doc(db, 'users', uid), minimalFallback, { merge: true });
    } else {
      throw err;
    }
  }
  console.log('[userService] User created in Firestore:', uid);
}

export async function mergeUserFields(uid, data = {}) {
  if (!uid) return;
  const db = getFirestore();
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
    await setDoc(doc(db, 'users', uid), patch, { merge: true });
  } catch (err) {
    if (err?.code === 'permission-denied') {
      await setDoc(doc(db, 'users', uid), basePayload, { merge: true });
      if (Object.keys(patch).length > 0) {
        await setDoc(doc(db, 'users', uid), patch, { merge: true });
      }
    } else {
      throw err;
    }
  }
}

// Description: Update user location and persist coarse geohash-5 + optional city/postalCode
export async function updateUserLocation(
  uid,
  { latitude, longitude, city, postalCode } = {}
) {
  if (!uid) return;
  const db = getFirestore();
  const patch = {};
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    patch.location = { latitude, longitude };
    patch.coarseGeohash5 = coarseGeohash5(latitude, longitude);
  }
  if (city) patch.city = city;
  if (postalCode) patch.postalCode = postalCode;

  if (Object.keys(patch).length === 0) return;

  await updateDoc(doc(db, 'users', uid), patch);
}
