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
  increment, // <-- add increment import
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
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
export const functions = getFunctions(app);
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

    // Update the eventCount field
    await updateDoc(userDoc, {
      eventCount: createdEvents + attendedEvents,
    });
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

  // Description: Add to following array and increment target user's followerCount atomically
  await updateDoc(currentUserDoc, {
    following: arrayUnion(targetUid),
  });
  await updateDoc(doc(db, 'users', targetUid), {
    followerCount: increment(1),
  });
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

  // Description: Remove from following array and decrement target user's followerCount atomically
  await updateDoc(currentUserDoc, {
    following: arrayRemove(targetUid),
  });
  await updateDoc(doc(db, 'users', targetUid), {
    followerCount: increment(-1),
  });
};
