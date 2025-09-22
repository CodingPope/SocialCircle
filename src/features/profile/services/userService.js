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
} from 'firebase/firestore';
import { geohashForLocation } from 'geofire-common';
import { track as trackClient } from '../../../lib/analytics';

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

export async function createUser(uid, userData) {
  const db = getFirestore();
  const defaultUser = {
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
    // Add any other fields your app expects
    createdAt: new Date(),
    lastActive: new Date(),
    isDeleted: false, // Soft delete flag
    deletedAt: null, // Timestamp for deletion
    coarseGeohash5: null, // analytics-friendly, privacy-preserving geohash
    // Premium & popularity defaults
    premiumActive: false,
    premiumTier: 'free', // free | premium | business (future)
    premiumSince: null,
    premiumUntil: null,
    isPopular: false,
    popularScore: 0,
  };

  // Compute coarse geohash if a valid location is provided in userData
  let coarse = null;
  try {
    const lat = userData?.location?.latitude;
    const lng = userData?.location?.longitude;
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !Number.isNaN(lat) &&
      !Number.isNaN(lng)
    ) {
      coarse = coarseGeohash5(lat, lng);
    }
  } catch {}

  const payload = {
    ...defaultUser,
    ...userData,
    coarseGeohash5: coarse ?? null,
    // Guard: if caller omitted, ensure defaults persist
    premiumActive: userData?.premiumActive ?? defaultUser.premiumActive,
    premiumTier: userData?.premiumTier ?? defaultUser.premiumTier,
    premiumSince: userData?.premiumSince ?? defaultUser.premiumSince,
    premiumUntil: userData?.premiumUntil ?? defaultUser.premiumUntil,
    isPopular: userData?.isPopular ?? defaultUser.isPopular,
    popularScore: userData?.popularScore ?? defaultUser.popularScore,
  };

  console.log('[userService] Creating user in Firestore:', uid, userData);
  await setDoc(doc(db, 'users', uid), payload);
  console.log('[userService] User created in Firestore:', uid);
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
