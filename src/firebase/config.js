// src/firebase/config.js
// Description: React Native Firebase configuration using native modules
import { USE_FIREBASE_EMULATORS } from '@env';
// React Native Firebase native modules
import nativeAuth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import storage from '@react-native-firebase/storage';
import logger from '../utils/logger';

let authInstance = null;

const initializeAuthSingleton = () => {
  if (authInstance) return authInstance;
  if (typeof nativeAuth !== 'function') {
    logger.error(
      '[Firebase Auth] Native module not linked. @react-native-firebase/auth is required.'
    );
    return null;
  }
  try {
    authInstance = nativeAuth();
  } catch (error) {
    logger.error(
      '[Firebase Auth] Failed to initialize default instance:',
      error?.message || error
    );
    authInstance = null;
  }
  return authInstance;
};

const resolveAuthInstance = (...args) => {
  if (typeof nativeAuth === 'function') {
    try {
      const instance = nativeAuth(...args);
      if (instance && typeof instance === 'object') {
        if (!authInstance) authInstance = instance;
        return instance;
      }
    } catch (error) {
      logger.warn(
        '[Firebase Auth] auth() call failed, using singleton:',
        error?.message || error
      );
    }
  }

  const fallback = initializeAuthSingleton();
  if (fallback) return fallback;

  throw new Error(
    '[Firebase Auth] Native module is unavailable. Did you install @react-native-firebase/auth and rebuild the app?'
  );
};

const auth = function (...args) {
  return resolveAuthInstance(...args);
};

if (nativeAuth && typeof nativeAuth === 'function') {
  const keys = [
    ...Object.getOwnPropertyNames(nativeAuth),
    ...Object.getOwnPropertySymbols(nativeAuth),
  ];
  keys.forEach((key) => {
    if (key === 'length' || key === 'name' || key === 'prototype') return;
    const descriptor = Object.getOwnPropertyDescriptor(nativeAuth, key);
    try {
      if (descriptor) {
        Object.defineProperty(auth, key, descriptor);
      } else {
        auth[key] = nativeAuth[key];
      }
    } catch (error) {
      try {
        auth[key] = nativeAuth[key];
      } catch {}
    }
  });
}

initializeAuthSingleton();

// Dev helpers: optional emulator support
if (__DEV__ && USE_FIREBASE_EMULATORS === '1') {
  try {
    auth().useEmulator('http://localhost:9099');
  } catch (e) {}
  try {
    firestore().useEmulator('localhost', 8080);
  } catch (e) {}
  try {
    functions().useEmulator('localhost', 5001);
  } catch (e) {}
  try {
    storage().useEmulator('localhost', 9199);
  } catch (e) {}
}

// Module singletons
const firestoreInstance = firestore();
const functionsInstance = functions();
const storageInstance = storage();
const DEFAULT_FUNCTION_REGION = 'us-central1';

const getProjectId = () => {
  try {
    const fromFunctions = functions()?.app?.options?.projectId;
    if (fromFunctions) return fromFunctions;
  } catch {}
  try {
    const fromAuth = authInstance?.app?.options?.projectId;
    if (fromAuth) return fromAuth;
  } catch {}
  return 'social-scene1';
};

const getCurrentFirebaseUser = () => {
  try {
    // Description: Try auth() function first (preferred for React Native Firebase)
    const live = auth()?.currentUser;
    if (live) {
      logger.debug(`[Firebase] getCurrentFirebaseUser: found user ${live.uid}`);
      return live;
    }
  } catch (err) {
    logger.warn('[Firebase] auth() failed:', err?.message || err);
  }
  try {
    // Description: Fallback to authInstance (singleton)
    if (authInstance?.currentUser) {
      logger.debug(
        `[Firebase] getCurrentFirebaseUser: found user via authInstance ${authInstance.currentUser.uid}`
      );
      return authInstance.currentUser;
    }
  } catch (err) {
    logger.warn('[Firebase] authInstance failed:', err?.message || err);
  }
  logger.debug('[Firebase] No authenticated user found');
  return null;
};

// Description: Wait for auth to be initialized with a user
const waitForAuthUser = async (maxWaitMs = 3000) => {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const user = getCurrentFirebaseUser();
    if (user?.uid) {
      logger.debug(`[Firebase] Auth user ready: ${user.uid}`);
      return user;
    }
    // Wait 100ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.warn('[Firebase] Timeout waiting for auth user');
  return null;
};

const isUnauthenticatedError = (error) => {
  if (!error) return false;
  const code = String(error.code || '').toLowerCase();
  if (code.includes('unauthenticated')) return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('unauthenticated');
};

const callCallableWithManualFetch = async (name, payload, originalError) => {
  if (typeof fetch !== 'function') {
    logger.warn('[Firebase] fetch not available for manual retry');
    throw originalError;
  }

  const user = getCurrentFirebaseUser();
  if (!user) {
    logger.warn('[Firebase] No user found for manual fetch retry');
    throw originalError;
  }

  // Description: Validate user has uid before attempting token refresh
  if (!user.uid) {
    logger.warn('[Firebase] User object exists but has no uid');
    throw new Error('UNAUTHENTICATED: User not properly authenticated');
  }

  let idToken;
  try {
    // Description: Force refresh token with forceRefresh=true
    idToken = await user.getIdToken(true);

    if (!idToken) {
      logger.warn('[Firebase] Token refresh returned null/undefined');
      throw new Error('UNAUTHENTICATED: Failed to get authentication token');
    }

    logger.debug(
      `[Firebase] Token retrieved successfully for ${name} (length: ${idToken.length})`
    );

    // Description: Decode JWT to inspect claims (for debugging)
    if (__DEV__) {
      try {
        const tokenParts = idToken.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          logger.debug(
            `[Firebase] Token payload - aud: ${payload.aud}, user_id: ${
              payload.user_id
            }, exp: ${new Date(payload.exp * 1000).toISOString()}`
          );
        }
      } catch (decodeErr) {
        logger.warn(
          '[Firebase] Could not decode token for inspection:',
          decodeErr
        );
      }
    }
  } catch (tokenError) {
    logger.warn(
      `[Firebase] Failed to refresh ID token before retrying callable ${name}:`,
      tokenError?.message || tokenError
    );
    throw new Error('UNAUTHENTICATED: Authentication token refresh failed');
  }

  const projectId = getProjectId();
  const url = `https://${DEFAULT_FUNCTION_REGION}-${projectId}.cloudfunctions.net/${name}`;

  logger.debug(`[Firebase] Manual fetch to: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: payload ?? null }),
    });

    const rawText = await response.text();
    logger.debug(
      `[Firebase] Response status: ${response.status}, body length: ${rawText.length}`
    );

    let parsed = {};
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch (parseError) {
        logger.warn(
          `[Firebase] Callable ${name} retry returned non-JSON payload`,
          parseError?.message || parseError
        );
        // Don't expose HTML error pages - throw original error instead
        if (rawText.includes('<html>') || rawText.includes('<!DOCTYPE')) {
          throw new Error(
            `HTTP ${response.status}: ${response.statusText || 'Server error'}`
          );
        }
        parsed = { result: rawText };
      }
    }

    if (!response.ok) {
      const details =
        parsed?.error?.message || parsed?.error || `HTTP ${response.status}`;
      throw new Error(details);
    }

    return parsed?.result ?? parsed?.data ?? parsed;
  } catch (fetchError) {
    logger.warn(
      `[Firebase] Callable retry failed for ${name}:`,
      fetchError?.message || fetchError
    );
    throw originalError;
  }
};

const callCallable = async (name, payload) => {
  try {
    // Description: Wait for auth to be ready with a valid user (important for app startup)
    let user = getCurrentFirebaseUser();

    // If no user immediately, wait a bit in case auth is still initializing
    if (!user) {
      logger.debug(
        `[Firebase] No immediate user for ${name}, waiting for auth...`
      );
      user = await waitForAuthUser(2000);
    }

    if (!user) {
      logger.warn(
        `[Firebase] No user found for callable ${name} after waiting`
      );
      throw new Error('UNAUTHENTICATED: Please sign in to continue');
    }

    if (!user.uid) {
      logger.warn(
        `[Firebase] User exists but has no uid for callable ${name}`
      );
      throw new Error('UNAUTHENTICATED: User authentication incomplete');
    }

    logger.debug(`[Firebase] Calling ${name} with user ${user.uid}`);

    // Description: Get fresh callable instance to ensure current auth context
    // Using functions() directly instead of cached functionsInstance
    const fn = functions().httpsCallable(name);

    // Description: Attempt the callable - SDK handles auth automatically
    const res = await fn(payload);
    logger.debug(`[Firebase] ${name} succeeded`);
    return res?.data;
  } catch (error) {
    logger.error(
      `[Firebase] Callable ${name} error:`,
      error?.code,
      error?.message || error
    );

    // Description: If UNAUTHENTICATED, it might be a token issue - try manual retry
    if (!isUnauthenticatedError(error)) {
      throw error;
    }

    // Description: Retry with manual fetch and explicit token
    logger.debug(
      `[Firebase] Retrying ${name} with manual fetch and fresh token...`
    );
    return callCallableWithManualFetch(name, payload, error);
  }
};

// Description: Disable App Verification for development (fixes auth/internal-error)
// This is required for iOS simulator and development builds
// Reference: https://rnfirebase.io/auth/usage#disable-app-verification
if (__DEV__) {
  const instanceForDev = authInstance || initializeAuthSingleton();
  try {
    if (instanceForDev?.settings) {
      instanceForDev.settings.appVerificationDisabledForTesting = true;
      logger.info(
        '🔧 [Firebase Auth] App verification disabled for development'
      );
    }
  } catch (error) {
    logger.warn('[Firebase Auth] Could not disable app verification:', error);
  }
}

// Description: Enable Firestore offline persistence (required for React Native)
// This must be called before any Firestore operations
try {
  firestoreInstance.settings({
    persistence: true, // Enable offline persistence
    cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED, // Optional: unlimited cache
  });
} catch (error) {
  // Settings can only be called once, so ignore if already set
  if (error.code !== 'failed-precondition') {
    logger.warn('[Firebase] Firestore settings error:', error);
  }
}

// Export auth module - consumers should call auth() to get the live instance
export { auth };
export { authInstance };

// Export Firestore instance and helpers
export const db = firestoreInstance;
export const FieldValue = firestore.FieldValue;
export const Timestamp = firestore.Timestamp;
export const GeoPoint = firestore.GeoPoint;
export const serverTimestamp = () => firestore.FieldValue.serverTimestamp();
export const arrayUnion = (...values) =>
  firestore.FieldValue.arrayUnion(...values);
export const arrayRemove = (...values) =>
  firestore.FieldValue.arrayRemove(...values);
export const deleteField = () => firestore.FieldValue.delete();

// Export Storage instance (not the function, the initialized instance)
export { storageInstance as storage };

// Export Functions instance (not the function, the initialized instance)
export { functionsInstance as functions };

// Description: Fetch user data from Firestore
export const getUserData = async (uid) => {
  const userDoc = await db.collection('users').doc(uid).get();
  return userDoc.exists ? userDoc.data() : {};
};

// Description: Update user data in Firestore
export const updateUserData = async (uid, data) => {
  await db.collection('users').doc(uid).update(data);
};

// Description: Upload profile image to Firebase Storage
export const uploadProfileImage = async (uid, imageFile) => {
  if (!uid) throw new Error('profile-image/missing-uid');
  if (!imageFile) throw new Error('profile-image/missing-file');

  const fileName = `${Date.now()}.jpg`;
  const imageRef = storageInstance.ref(`profileImages/${uid}/${fileName}`);

  logger.debug('[uploadProfileImage] Starting upload for uid:', uid);
  logger.debug('[uploadProfileImage] Image file type:', typeof imageFile);

  // Metadata for the upload
  const metadata = {
    contentType:
      typeof imageFile === 'object' && imageFile?.type
        ? imageFile.type
        : 'image/jpeg',
  };

  try {
    // Handle both URI strings and blobs
    if (typeof imageFile === 'string') {
      // Local URI - use putFile
      await imageRef.putFile(imageFile, metadata);
    } else {
      // Blob or other object - use put
      await imageRef.put(imageFile, metadata);
    }

    const downloadURL = await imageRef.getDownloadURL();
    logger.debug('[uploadProfileImage] Upload complete');
    return downloadURL;
  } catch (error) {
    logger.error('[uploadProfileImage] Upload failed:', error?.message || error);
    throw error;
  }
};

// Description: Update event count for the user
export const updateEventCount = async (uid) => {
  const userRef = db.collection('users').doc(uid);
  const userSnapshot = await userRef.get();

  if (userSnapshot.exists) {
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

    await userRef.update(payload);
  }
};

// Description: Add a friend (mutual)
export const addFriend = async (currentUid, targetUid) => {
  // Add each user to the other's friends array
  await db
    .collection('users')
    .doc(currentUid)
    .update({
      friends: firestore.FieldValue.arrayUnion(targetUid),
    });
  await db
    .collection('users')
    .doc(targetUid)
    .update({
      friends: firestore.FieldValue.arrayUnion(currentUid),
    });
};

// Description: Remove a friend (mutual)
export const removeFriend = async (currentUid, targetUid) => {
  await db
    .collection('users')
    .doc(currentUid)
    .update({
      friends: firestore.FieldValue.arrayRemove(targetUid),
    });
  await db
    .collection('users')
    .doc(targetUid)
    .update({
      friends: firestore.FieldValue.arrayRemove(currentUid),
    });
};

// Description: Request to follow (private profile)
export const requestFollow = async (currentUid, targetUid) => {
  // Description: Add currentUid to target user's followRequests array
  await db
    .collection('users')
    .doc(targetUid)
    .update({
      followRequests: firestore.FieldValue.arrayUnion(currentUid),
    });
};

// Description: Approve follow request
export const approveFollowRequest = async (currentUid, requesterUid) => {
  // Description: Remove requesterUid from followRequests, add to followers/following
  await db
    .collection('users')
    .doc(currentUid)
    .update({
      followRequests: firestore.FieldValue.arrayRemove(requesterUid),
      followers: firestore.FieldValue.arrayUnion(requesterUid),
    });
  await db
    .collection('users')
    .doc(requesterUid)
    .update({
      following: firestore.FieldValue.arrayUnion(currentUid),
    });
};

// Description: Deny follow request
export const denyFollowRequest = async (currentUid, requesterUid) => {
  // Description: Remove requesterUid from followRequests
  await db
    .collection('users')
    .doc(currentUid)
    .update({
      followRequests: firestore.FieldValue.arrayRemove(requesterUid),
    });
};

// Description: Follow a user (one-way, for public profiles)
export const followUser = async (currentUid, targetUid) => {
  // Description: Prevent following yourself
  if (currentUid === targetUid) return;

  // Description: Add targetUid to current user's following array if not already present
  const currentUserRef = db.collection('users').doc(currentUid);
  const currentUserSnap = await currentUserRef.get();
  const currentUserData = currentUserSnap.exists ? currentUserSnap.data() : {};
  const alreadyFollowing =
    Array.isArray(currentUserData.following) &&
    currentUserData.following.includes(targetUid);
  if (alreadyFollowing) return;

  // Only update the caller's own document (allowed by rules)
  await currentUserRef.update({
    following: firestore.FieldValue.arrayUnion(targetUid),
  });

  // Note: We intentionally do NOT update target user's followerCount here, since
  // client is not allowed to write someone else's user doc per rules. Use a backend
  // function/cron to reconcile counts if needed.
};

// Description: Unfollow a user
export const unfollowUser = async (currentUid, targetUid) => {
  // Description: Prevent unfollowing yourself
  if (currentUid === targetUid) return;

  // Description: Remove targetUid from current user's following array if present
  const currentUserRef = db.collection('users').doc(currentUid);
  const currentUserSnap = await currentUserRef.get();
  const currentUserData = currentUserSnap.exists ? currentUserSnap.data() : {};
  const isFollowing =
    Array.isArray(currentUserData.following) &&
    currentUserData.following.includes(targetUid);
  if (!isFollowing) return;

  // Only update the caller's own document (allowed by rules)
  await currentUserRef.update({
    following: firestore.FieldValue.arrayRemove(targetUid),
  });

  // Note: No decrement on target user's followerCount for the same permissions reason.
};

// Description: Send a notification via callable (server-side creation only)
export const sendNotification = async (type, recipientId, data = {}) => {
  const currentUser = auth().currentUser;
  const hasCurrentUser = Boolean(currentUser);
  if (!hasCurrentUser) {
    logger.warn('sendNotification skipped: no authenticated user');
    return { ok: false, skipped: true };
  }

  const basePayload = { type, recipientId, data };

  try {
    const createNotification =
      functionsInstance.httpsCallable('createNotification');
    const result = await createNotification(basePayload);
    if (result?.data) return result.data;
    return { ok: true };
  } catch (callableError) {
    const code = callableError?.code || 'unknown';
    const message = callableError?.message || String(callableError);
    logger.warn('sendNotification callable error', { code, message });

    // Retry logic for unauthenticated errors
    if (code === 'functions/unauthenticated') {
      try {
        // Force token refresh
        await currentUser.getIdToken(true);
        const createNotification =
          functionsInstance.httpsCallable('createNotification');
        const retryResult = await createNotification(basePayload);
        if (retryResult?.data) return retryResult.data;
        return { ok: true };
      } catch (retryError) {
        const retryCode = retryError?.code || 'unknown';
        const retryMessage = retryError?.message || String(retryError);
        logger.warn('sendNotification callable retry failed', {
          code: retryCode,
          message: retryMessage,
        });
      }
    }

    throw callableError;
  }
};

// Description: Update user rating
export const updateUserRating = async (uid, raterUid, rating) => {
  const userRef = db.collection('users').doc(uid);
  const userSnapshot = await userRef.get();

  if (userSnapshot.exists) {
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
    await userRef.update({
      ratings, // Save the updated ratings map
      rating: newRating,
      ratingCount: newRatingCount,
    });
  }
};

// Description: Delete an event (post) - call server-side callable to perform soft-delete with proper permissions
export const deleteEvent = async (eventId, userId) => {
  // Guard: ensure caller is signed in so callable receives auth context
  if (!auth().currentUser) {
    const err = new Error(
      'User not authenticated. Please sign in and try again.'
    );
    err.code = 'client/unauthenticated';
    throw err;
  }

  try {
    // Use regional functions instance
    const deleteEventFn = functionsInstance.httpsCallable('deleteEvent');
    const res = await deleteEventFn({ eventId });
    if (res && res.data) return res.data;
    return { ok: true };
  } catch (error) {
    logger.error(
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
      const eventRef = db.collection('events').doc(eventId);
      await eventRef.update({
        isDeleted: true,
        deletedAt: new Date(),
      });
      if (userId) {
        await db
          .collection('users')
          .doc(userId)
          .update({
            createdEvents: firestore.FieldValue.arrayRemove(eventId),
          });
      }
      await updateEventCount(userId).catch(() => {});
      return { ok: true, fallback: true };
    } catch (err) {
      logger.error('Fallback client delete failed:', err.message || err);
      throw err;
    }
  }
};

// Description: Report a post (event or user) via callable to bypass locked Firestore rules
export const reportContent = async (
  reporterId,
  targetId,
  type,
  reason,
  options = {}
) => {
  try {
    // reporterId is ignored on server; use it only for local analytics if needed
    const createReport = functionsInstance.httpsCallable('createReport');
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
    logger.error('Error reporting content:', error);
    throw error;
  }
};

// Description: Soft delete an event
export async function softDeleteEvent(eventId) {
  try {
    const eventRef = db.collection('events').doc(eventId);
    const snapshot = await eventRef.get();
    if (!snapshot.exists) throw new Error('Event does not exist');

    await eventRef.update({
      isDeleted: true,
      deletedAt: new Date(),
    });
  } catch (error) {
    logger.error('Error soft-deleting event:', error);
    throw error;
  }
}

// Description: Get user events by IDs (handles batching for Firestore 'in' query limit)
export async function getUserEventsByIds(eventIds) {
  if (!eventIds || eventIds.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < eventIds.length; i += 30) {
    chunks.push(eventIds.slice(i, i + 30));
  }
  let allResults = [];
  for (const chunk of chunks) {
    const snapshot = await db
      .collection('events')
      .where(firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    allResults = allResults.concat(
      snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    );
  }
  // Exclude soft-deleted events client-side to avoid requiring a composite index
  return allResults.filter((e) => e.isDeleted !== true);
}

// Description: Update user rating via callable (enforces mutual-event rule server-side)
export const rateUserCallable = async (targetUid, raterUid, rating) => {
  const rateUser = functionsInstance.httpsCallable('rateUser');
  const res = await rateUser({ targetUid, rating });
  return res?.data || { ok: true };
};

// Description: Business Onboarding Callables
export const createBusinessDraft = async (type = 'single') =>
  callCallable('createBusinessDraft', { type });

export const updateBusinessBasics = async (payload) =>
  callCallable('updateBusinessBasics', payload); // { ok }

export const updateBrandAssets = async (payload) =>
  callCallable('updateBrandAssets', payload);

export const addBusinessLocation = async (payload) =>
  callCallable('addBusinessLocation', payload); // { ok, locId }

export const updateAudiencePolicies = async (payload) =>
  callCallable('updateAudiencePolicies', payload);

export const startBusinessVerification = async (payload) =>
  callCallable('startBusinessVerification', payload); // { ok, devCode }

export const verifyBusinessCode = async (payload) =>
  callCallable('verifyBusinessCode', payload);

export const addBusinessMember = async (payload) =>
  callCallable('addBusinessMember', payload);

export const setBusinessPrivacy = async (payload) =>
  callCallable('setBusinessPrivacy', payload);

export const submitBusiness = async (payload) =>
  callCallable('submitBusiness', payload); // { ok, status }

// -------------------- USER VERIFICATION --------------------

// Description: Request email verification code
export const requestEmailVerification = async () => {
  const fn = functionsInstance.httpsCallable('requestEmailVerification');
  const res = await fn();
  return res?.data;
};

// Description: Verify email code
export const verifyEmailCode = async (code) => {
  const fn = functionsInstance.httpsCallable('verifyEmailCode');
  const res = await fn({ code });
  return res?.data;
};

// Description: Request phone verification code
export const requestPhoneVerification = async (phoneNumber) => {
  const fn = functionsInstance.httpsCallable('requestPhoneVerification');
  const res = await fn({ phoneNumber });
  return res?.data;
};

// Description: Verify phone code
export const verifyPhoneCode = async (code) => {
  const fn = functionsInstance.httpsCallable('verifyPhoneCode');
  const res = await fn({ code });
  return res?.data;
};
