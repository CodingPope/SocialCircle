// src/firebase/config.js
// Description: React Native Firebase configuration using native modules
import {
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
} from '@env';

// React Native Firebase native modules
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import storage from '@react-native-firebase/storage';

// Export auth module - consumers should call auth() to get the instance
export { auth };

// Export Firestore instance
export const db = firestore();

// Export Functions instance with region  
export const functionsInstance = functions().useRegion('us-central1');
export { functionsInstance as functions };

// Export Storage instance
export const storageInstance = storage();
export { storageInstance as storage };

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
  
  // Metadata for the upload
  const metadata = {
    contentType: (typeof imageFile === 'object' && imageFile?.type)
      ? imageFile.type
      : 'image/jpeg',
  };

  // Handle both URI strings and blobs
  if (typeof imageFile === 'string') {
    // Local URI - use putFile
    await imageRef.putFile(imageFile, metadata);
  } else {
    // Blob or other object - use put
    await imageRef.put(imageFile, metadata);
  }
  
  return await imageRef.getDownloadURL();
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
  await db.collection('users').doc(currentUid).update({
    friends: firestore.FieldValue.arrayUnion(targetUid),
  });
  await db.collection('users').doc(targetUid).update({
    friends: firestore.FieldValue.arrayUnion(currentUid),
  });
};

// Description: Remove a friend (mutual)
export const removeFriend = async (currentUid, targetUid) => {
  await db.collection('users').doc(currentUid).update({
    friends: firestore.FieldValue.arrayRemove(targetUid),
  });
  await db.collection('users').doc(targetUid).update({
    friends: firestore.FieldValue.arrayRemove(currentUid),
  });
};

// Description: Request to follow (private profile)
export const requestFollow = async (currentUid, targetUid) => {
  // Description: Add currentUid to target user's followRequests array
  await db.collection('users').doc(targetUid).update({
    followRequests: firestore.FieldValue.arrayUnion(currentUid),
  });
};

// Description: Approve follow request
export const approveFollowRequest = async (currentUid, requesterUid) => {
  // Description: Remove requesterUid from followRequests, add to followers/following
  await db.collection('users').doc(currentUid).update({
    followRequests: firestore.FieldValue.arrayRemove(requesterUid),
    followers: firestore.FieldValue.arrayUnion(requesterUid),
  });
  await db.collection('users').doc(requesterUid).update({
    following: firestore.FieldValue.arrayUnion(currentUid),
  });
};

// Description: Deny follow request
export const denyFollowRequest = async (currentUid, requesterUid) => {
  // Description: Remove requesterUid from followRequests
  await db.collection('users').doc(currentUid).update({
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
  const currentUserData = currentUserSnap.exists
    ? currentUserSnap.data()
    : {};
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
  const currentUserData = currentUserSnap.exists
    ? currentUserSnap.data()
    : {};
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
    console.warn('sendNotification skipped: no authenticated user');
    return { ok: false, skipped: true };
  }

  const basePayload = { type, recipientId, data };
  
  try {
    const createNotification = functionsInstance.httpsCallable('createNotification');
    const result = await createNotification(basePayload);
    if (result?.data) return result.data;
    return { ok: true };
  } catch (callableError) {
    const code = callableError?.code || 'unknown';
    const message = callableError?.message || String(callableError);
    console.warn('sendNotification callable error', { code, message });

    // Retry logic for unauthenticated errors
    if (code === 'functions/unauthenticated') {
      try {
        // Force token refresh
        await currentUser.getIdToken(true);
        const createNotification = functionsInstance.httpsCallable('createNotification');
        const retryResult = await createNotification(basePayload);
        if (retryResult?.data) return retryResult.data;
        return { ok: true };
      } catch (retryError) {
        const retryCode = retryError?.code || 'unknown';
        const retryMessage = retryError?.message || String(retryError);
        console.warn('sendNotification callable retry failed', {
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
      const eventRef = db.collection('events').doc(eventId);
      await eventRef.update({
        isDeleted: true,
        deletedAt: new Date(),
      });
      if (userId) {
        await db.collection('users').doc(userId).update({
          createdEvents: firestore.FieldValue.arrayRemove(eventId),
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
    console.error('Error reporting content:', error);
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
    console.error('Error soft-deleting event:', error);
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
export const createBusinessDraft = async (type = 'single') => {
  const fn = functionsInstance.httpsCallable('createBusinessDraft');
  const res = await fn({ type });
  return res?.data; // { ok, bizId }
};

export const updateBusinessBasics = async (payload) => {
  const fn = functionsInstance.httpsCallable('updateBusinessBasics');
  const res = await fn(payload);
  return res?.data; // { ok }
};

export const updateBrandAssets = async (payload) => {
  const fn = functionsInstance.httpsCallable('updateBrandAssets');
  const res = await fn(payload);
  return res?.data;
};

export const addBusinessLocation = async (payload) => {
  const fn = functionsInstance.httpsCallable('addBusinessLocation');
  const res = await fn(payload);
  return res?.data; // { ok, locId }
};

export const updateAudiencePolicies = async (payload) => {
  const fn = functionsInstance.httpsCallable('updateAudiencePolicies');
  const res = await fn(payload);
  return res?.data;
};

export const startBusinessVerification = async (payload) => {
  const fn = functionsInstance.httpsCallable('startBusinessVerification');
  const res = await fn(payload);
  return res?.data; // { ok, devCode }
};

export const verifyBusinessCode = async (payload) => {
  const fn = functionsInstance.httpsCallable('verifyBusinessCode');
  const res = await fn(payload);
  return res?.data;
};

export const addBusinessMember = async (payload) => {
  const fn = functionsInstance.httpsCallable('addBusinessMember');
  const res = await fn(payload);
  return res?.data;
};

export const setBusinessPrivacy = async (payload) => {
  const fn = functionsInstance.httpsCallable('setBusinessPrivacy');
  const res = await fn(payload);
  return res?.data;
};

export const submitBusiness = async (payload) => {
  const fn = functionsInstance.httpsCallable('submitBusiness');
  const res = await fn(payload);
  return res?.data; // { ok, status }
};
