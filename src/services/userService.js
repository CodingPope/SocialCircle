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

/**
 * Checks if a user with the given email exists and is soft-deleted.
 * If found, returns the user document reference and data.
 */
export async function findSoftDeletedUserByEmail(email) {
  const db = getFirestore();
  console.log('[userService] Checking for soft-deleted user by email:', email);
  const q = query(
    collection(db, 'users'),
    where('email', '==', email),
    where('isDeleted', '==', true)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    console.log('[userService] Soft-deleted user found:', docSnap.id);
    return { ref: docSnap.ref, data: docSnap.data(), id: docSnap.id };
  }
  console.log('[userService] No soft-deleted user found for:', email);
  return null;
}

/**
 * Reactivates a soft-deleted user account by resetting isDeleted and deletedAt, and optionally updating fields.
 * Also re-enables the Auth user if disabled (via a callable cloud function).
 */
import { httpsCallable } from 'firebase/functions';
import { functions as firebaseFunctions } from '../firebase/config';

export async function reactivateUser(userId, updates = {}) {
  const db = getFirestore();
  const userRef = doc(db, 'users', userId);
  console.log('[userService] Reactivating user:', userId, updates);
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
      return null;
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
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
  };
  console.log('[userService] Creating user in Firestore:', uid, userData);
  await setDoc(doc(db, 'users', uid), {
    ...defaultUser,
    ...userData,
  });
  console.log('[userService] User created in Firestore:', uid);
}
