// src/firebase/config.js
import {
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
} from '@env';

import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  collection,
  query,
  where,
  deleteDoc,
  addDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// ← use initializeAuth with RN AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

export const db = getFirestore(app);
// Initialize Functions in the same region as deployed callables
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);

// Fetch user data from Firestore
export const getUserData = async (uid) => {
  const userDoc = doc(db, 'users', uid);
  const userSnapshot = await getDoc(userDoc);
  return userSnapshot.exists() ? userSnapshot.data() : {};
};

// Update user data in Firestore
export const updateUserData = async (uid, data) => {
  const userDoc = doc(db, 'users', uid);
  await updateDoc(userDoc, data);
};

// Upload profile image to Firebase Storage
export const uploadProfileImage = async (uid, imageFile) => {
  const imageRef = ref(storage, `profileImages/${uid}`);
  await uploadBytes(imageRef, imageFile);
  return await getDownloadURL(imageRef);
};

// Update event count for the user
export const updateEventCount = async (uid) => {
  const userDoc = doc(db, 'users', uid);
  const userSnapshot = await getDoc(userDoc);

  if (userSnapshot.exists()) {
    const userData = userSnapshot.data();

    // Ensure createdEvents and attendedEvents are treated as counts
    const createdEvents = Array.isArray(userData.createdEvents)
      ? userData.createdEvents.length
      : userData.createdEvents || 0;
    const attendedEvents = Array.isArray(userData.attendedEvents)
      ? userData.attendedEvents.length
      : userData.attendedEvents || 0;

    // Normalize deviceToken for rules compliance on update
    const currentToken = userData.deviceToken;
    const safeToken =
      typeof currentToken === 'string' &&
      /^ExponentPushToken/.test(currentToken)
        ? currentToken
        : null;

    // Update the eventCount field (and deviceToken if needed) to satisfy rules
    const payload = { eventCount: createdEvents + attendedEvents };
    if (currentToken !== safeToken) payload.deviceToken = safeToken;

    await updateDoc(userDoc, payload);
  }
};

// Add a friend (mutual)
export const addFriend = async (currentUid, targetUid) => {
  // Add each user to the other's friends array
  await updateDoc(doc(db, 'users', currentUid), {
    friends: arrayUnion(targetUid),
  });
  await updateDoc(doc(db, 'users', targetUid), {
    friends: arrayUnion(currentUid),
  });
};

// Remove a friend (mutual)
export const removeFriend = async (currentUid, targetUid) => {
  await updateDoc(doc(db, 'users', currentUid), {
    friends: arrayRemove(targetUid),
  });
  await updateDoc(doc(db, 'users', targetUid), {
    friends: arrayRemove(currentUid),
  });
};

// Request to follow (private profile)
export const requestFollow = async (currentUid, targetUid) => {
  // Description: Add currentUid to target user's followRequests array
  await updateDoc(doc(db, 'users', targetUid), {
    followRequests: arrayUnion(currentUid),
  });
};

// Approve follow request
export const approveFollowRequest = async (currentUid, requesterUid) => {
  // Description: Remove requesterUid from followRequests, add to followers/following
  await updateDoc(doc(db, 'users', currentUid), {
    followRequests: arrayRemove(requesterUid),
    followers: arrayUnion(requesterUid),
  });
  await updateDoc(doc(db, 'users', requesterUid), {
    following: arrayUnion(currentUid),
  });
};

// Deny follow request
export const denyFollowRequest = async (currentUid, requesterUid) => {
  // Description: Remove requesterUid from followRequests
  await updateDoc(doc(db, 'users', currentUid), {
    followRequests: arrayRemove(requesterUid),
  });
};

// Follow a user (one-way, for public profiles)
export const followUser = async (currentUid, targetUid) => {
  // Description: Prevent following yourself
  if (currentUid === targetUid) return;

  // Description: Add targetUid to current user's following array if not already present
  const currentUserDoc = doc(db, 'users', currentUid);
  const currentUserSnap = await getDoc(currentUserDoc);
  const currentUserData = currentUserSnap.exists()
    ? currentUserSnap.data()
    : {};
  const alreadyFollowing =
    Array.isArray(currentUserData.following) &&
    currentUserData.following.includes(targetUid);
  if (alreadyFollowing) return;

  // Only update the caller's own document (allowed by rules)
  await updateDoc(currentUserDoc, {
    following: arrayUnion(targetUid),
  });

  // Note: We intentionally do NOT update target user's followerCount here, since
  // client is not allowed to write someone else's user doc per rules. Use a backend
  // function/cron to reconcile counts if needed.
};

// Unfollow a user
export const unfollowUser = async (currentUid, targetUid) => {
  // Description: Prevent unfollowing yourself
  if (currentUid === targetUid) return;

  // Description: Remove targetUid from current user's following array if present
  const currentUserDoc = doc(db, 'users', currentUid);
  const currentUserSnap = await getDoc(currentUserDoc);
  const currentUserData = currentUserSnap.exists()
    ? currentUserSnap.data()
    : {};
  const isFollowing =
    Array.isArray(currentUserData.following) &&
    currentUserData.following.includes(targetUid);
  if (!isFollowing) return;

  // Only update the caller's own document (allowed by rules)
  await updateDoc(currentUserDoc, {
    following: arrayRemove(targetUid),
  });

  // Note: No decrement on target user's followerCount for the same permissions reason.
};

// Send a notification via callable (server-side creation only)
export const sendNotification = async (type, recipientId, data = {}) => {
  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    const functions = getFunctions(getApp(), 'us-central1');
    const create = httpsCallable(functions, 'createNotification');
    const res = await create({ type, recipientId, data });
    return res?.data || { ok: true };
  } catch (e) {
    console.error('sendNotification failed:', e);
    throw e;
  }
};

// Update user rating
export const updateUserRating = async (uid, raterUid, rating) => {
  const userDoc = doc(db, 'users', uid);
  const userSnapshot = await getDoc(userDoc);

  if (userSnapshot.exists()) {
    const userData = userSnapshot.data();
    const ratings = userData.ratings || {}; // Ensure ratings map exists

    // Update the ratings map
    ratings[raterUid] = rating;

    // Calculate the new average rating
    const totalRatings = Object.values(ratings);
    const newRatingCount = totalRatings.length;
    const newRating =
      totalRatings.reduce((sum, r) => sum + r, 0) / newRatingCount;

    // Update Firestore with the new rating and rating count
    await updateDoc(userDoc, {
      ratings, // Save the updated ratings map
      rating: newRating,
      ratingCount: newRatingCount,
    });
  }
};

// Delete an event (post) - call server-side callable to perform soft-delete with proper permissions
export const deleteEvent = async (eventId, userId) => {
  // Guard: ensure caller is signed in so callable receives auth context
  if (!auth.currentUser) {
    const err = new Error(
      'User not authenticated. Please sign in and try again.'
    );
    err.code = 'client/unauthenticated';
    throw err;
  }

  try {
    // Use regional functions instance to match deployment region (us-central1)
    const functionsRegional = getFunctions(app, 'us-central1');
    const fn = httpsCallable(functionsRegional, 'deleteEvent');
    const res = await fn({ eventId });
    if (res && res.data) return res.data;
    return { ok: true };
  } catch (error) {
    console.error(
      'Callable deleteEvent failed, falling back to client update if allowed:',
      error.message || error
    );

    // If the error is explicitly unauthenticated, bubble a clearer error
    if (
      error.code === 'functions/unauthenticated' ||
      error.message?.toLowerCase?.().includes('unauthenticated')
    ) {
      const e = new Error(
        'Delete failed: not authenticated. Please re-login and try again.'
      );
      e.code = 'client/unauthenticated';
      throw e;
    }

    // Try legacy client-side soft-delete as fallback (may be rejected by rules)
    try {
      const eventRef = doc(db, 'events', eventId);
      await updateDoc(eventRef, {
        isDeleted: true,
        deletedAt: new Date(),
      });
      if (userId) {
        await updateDoc(doc(db, 'users', userId), {
          createdEvents: arrayRemove(eventId),
        });
      }
      await updateEventCount(userId).catch(() => {});
      return { ok: true, fallback: true };
    } catch (err) {
      console.error('Fallback client delete failed:', err.message || err);
      throw err;
    }
  }
};

// Report a post (event or user) via callable to bypass locked Firestore rules
export const reportContent = async (
  reporterId,
  targetId,
  type,
  reason,
  options = {}
) => {
  try {
    // reporterId is ignored on server; use it only for local analytics if needed
    const functionsRegional = getFunctions(app, 'us-central1');
    const createReport = httpsCallable(functionsRegional, 'createReport');
    const payload = {
      type, // 'event' | 'user'
      targetId,
      reason: reason || 'No reason provided',
      details: options.details || null,
      evidence: Array.isArray(options.evidence) ? options.evidence : [],
      context: options.context || {}, // { eventId?, messageId? }
    };
    const res = await createReport(payload);
    return res?.data || { ok: true };
  } catch (error) {
    console.error('Error reporting content:', error);
    throw error;
  }
};

export async function softDeleteEvent(eventId) {
  try {
    const eventRef = doc(db, 'events', eventId);
    const snapshot = await getDoc(eventRef);
    if (!snapshot.exists()) throw new Error('Event does not exist');

    await updateDoc(eventRef, {
      isDeleted: true,
      deletedAt: new Date(),
    });
  } catch (error) {
    console.error('Error soft-deleting event:', error);
    throw error;
  }
}

export async function getUserEventsByIds(eventIds) {
  if (!eventIds || eventIds.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < eventIds.length; i += 30) {
    chunks.push(eventIds.slice(i, i + 30));
  }
  let allResults = [];
  for (const chunk of chunks) {
    const q = query(collection(db, 'events'), where('__name__', 'in', chunk));
    const snapshot = await getDocs(q);
    allResults = allResults.concat(
      snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    );
  }
  // Exclude soft-deleted events client-side to avoid requiring a composite index
  return allResults.filter((e) => e.isDeleted !== true);
}

// Update user rating via callable (enforces mutual-event rule server-side)
export const rateUserCallable = async (targetUid, raterUid, rating) => {
  const fn = httpsCallable(functions, 'rateUser');
  const res = await fn({ targetUid, rating });
  return res?.data || { ok: true };
};
