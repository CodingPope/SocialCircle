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
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
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
