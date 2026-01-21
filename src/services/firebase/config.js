// src/services/firebase/config.js
// Description: React Native Firebase configuration using native modules

// React Native Firebase native modules
import nativeAuth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import storage from '@react-native-firebase/storage';
import appCheck from '@react-native-firebase/app-check';
import logger from '../../lib/logger';
import { Alert, Platform } from 'react-native';

logger.debug('[Firebase] Initializing configuration');

// Description: Safely import environment variables with fallback
let USE_FIREBASE_EMULATORS = '0';
let FIREBASE_EMULATOR_HOST = '';
let FORCE_FIREBASE_APPCHECK_DEBUG = '0';
let DISABLE_FIREBASE_APPCHECK =
  typeof __DEV__ !== 'undefined' && __DEV__ ? '1' : '0';
try {
  const envVars = require('@env');
  if (envVars && envVars.USE_FIREBASE_EMULATORS) {
    USE_FIREBASE_EMULATORS = envVars.USE_FIREBASE_EMULATORS;
  }
  if (envVars && envVars.FIREBASE_EMULATOR_HOST) {
    FIREBASE_EMULATOR_HOST = envVars.FIREBASE_EMULATOR_HOST;
  }
  if (envVars && envVars.FORCE_FIREBASE_APPCHECK_DEBUG) {
    FORCE_FIREBASE_APPCHECK_DEBUG = envVars.FORCE_FIREBASE_APPCHECK_DEBUG;
  }
  if (envVars && envVars.DISABLE_FIREBASE_APPCHECK) {
    DISABLE_FIREBASE_APPCHECK = envVars.DISABLE_FIREBASE_APPCHECK;
  }
  logger.debug('[Firebase] Environment variables loaded');
} catch (error) {
  // @env module not available in production builds, use default
  logger.debug(
    '[Firebase] Environment variables not available, using defaults'
  );
}

const isDevBuild = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

let authInstance = null;

const initializeAuthSingleton = () => {
  logger.debug('[Firebase] Initializing auth singleton');
  if (authInstance) {
    logger.debug('[Firebase] Auth instance already exists');
    return authInstance;
  }
  if (typeof nativeAuth !== 'function') {
    console.error('[Firebase Auth] Native module not linked');
    logger.error(
      '[Firebase Auth] Native module not linked. @react-native-firebase/auth is required.'
    );
    return null;
  }
  try {
    authInstance = nativeAuth();
    logger.debug('[Firebase] Auth instance created successfully');
  } catch (error) {
    logger.error(
      '[Firebase Auth] Failed to initialize:',
      error?.message || 'Unknown error'
    );
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
  const host =
    FIREBASE_EMULATOR_HOST ||
    (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
  const authHost = host.startsWith('http') ? host : `http://${host}`;
  try {
    auth().useEmulator(`${authHost}:9099`);
    logger.info(`[Firebase] Auth emulator: ${authHost}:9099`);
  } catch (e) {}
  try {
    firestore().useEmulator(host, 8080);
    logger.info(`[Firebase] Firestore emulator: ${host}:8080`);
  } catch (e) {}
  try {
    functions().useEmulator(host, 5001);
    logger.info(`[Firebase] Functions emulator: ${host}:5001`);
  } catch (e) {}
  try {
    storage().useEmulator(host, 9199);
    logger.info(`[Firebase] Storage emulator: ${host}:9199`);
  } catch (e) {}
}

// Module singletons
const firestoreInstance = firestore();
const DEFAULT_FUNCTION_REGION = 'us-central1';
const functionsInstance = functions();
const storageInstance = storage();

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
// Production timeout: 5s to accommodate slower networks and cold starts
const waitForAuthUser = async (maxWaitMs = 5000) => {
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
  let appCheckToken = null;
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

  // Description: Try to get an App Check token so the manual request passes enforceAppCheck
  if (!APP_CHECK_DISABLED) {
    try {
      const tokenResult = await appCheck().getToken(true);
      if (tokenResult?.token) {
        appCheckToken = tokenResult.token;
      }
    } catch (tokenErr) {
      logger.warn(
        `[Firebase] Failed to get App Check token for ${name}:`,
        tokenErr?.message || tokenErr
      );
    }
  }

  // Ensure we have a projectId for manual fetch URL
  const projectId = getProjectId();
  const url = `https://${DEFAULT_FUNCTION_REGION}-${projectId}.cloudfunctions.net/${name}`;

  logger.debug(`[Firebase] Manual fetch to: ${url}`);

  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    };
    if (appCheckToken) {
      headers['X-Firebase-AppCheck'] = appCheckToken;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
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
    throw fetchError;
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
      user = await waitForAuthUser(5000);
    }

    if (!user) {
      logger.warn(
        `[Firebase] No user found for callable ${name} after waiting`
      );
      throw new Error('UNAUTHENTICATED: Please sign in to continue');
    }

    if (!user.uid) {
      logger.warn(`[Firebase] User exists but has no uid for callable ${name}`);
      throw new Error('UNAUTHENTICATED: User authentication incomplete');
    }

    try {
      // Ensure auth token is fresh before calling a callable.
      await user.getIdToken(true);
    } catch (tokenError) {
      logger.warn(
        `[Firebase] Failed to refresh ID token before ${name}:`,
        tokenError?.message || tokenError
      );
    }

    if (!APP_CHECK_DISABLED) {
      try {
        // Preflight App Check token so callable has a valid token when enforced.
        await appCheck().getToken(true);
      } catch (tokenError) {
        logger.warn(
          `[Firebase] Failed to prefetch App Check token before ${name}:`,
          tokenError?.message || tokenError
        );
      }
    }

    logger.debug(`[Firebase] Calling ${name} with user ${user.uid}`);

    // Description: Use regioned functions instance to ensure consistency with manual retry
    // Always use us-central1 region for all callable functions
    const fn = functionsInstance.httpsCallable(name);

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

// Description: Export callable helper so feature modules can benefit from auth wait/retry logic
export const callFirebaseFunction = (name, payload) =>
  callCallable(name, payload);

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

// Description: Initialize Firebase App Check for production security
// Uses debug provider in dev, DeviceCheck (iOS) / Play Integrity (Android) in production
// Reference: https://rnfirebase.io/app-check/usage
let lastAlertedAppCheckToken = null;
const APP_CHECK_DISABLED = DISABLE_FIREBASE_APPCHECK === '1';

const logAppCheckDebugToken = (source, token) => {
  if (!token) {
    logger.warn(`[Firebase App Check] ${source} returned an empty token`);
    return;
  }

  const lines = [
    '🔑 ═══════════════════════════════════════════════════════════',
    `🔑 APP CHECK DEBUG TOKEN (${source})`,
    `🔑 ${token}`,
    '🔑 ═══════════════════════════════════════════════════════════',
    '🔑 Register this token at:',
    '🔑 https://console.firebase.google.com/project/social-scene1/appcheck/apps',
    '🔑 ═══════════════════════════════════════════════════════════',
  ];

  lines.forEach((line) => console.log(line));
  logger.info(`[Firebase App Check] Debug token (${source}): ${token}`);

  try {
    if (lastAlertedAppCheckToken !== token && Alert?.alert) {
      lastAlertedAppCheckToken = token;
      Alert.alert('Firebase App Check Debug Token', `(${source})\n${token}`, [
        {
          text: 'Close',
          style: 'cancel',
        },
      ]);
    }
  } catch (alertError) {
    console.log(
      '[Firebase App Check] Unable to show token alert:',
      alertError?.message || alertError
    );
  }
};

const shouldUseDebugAppCheck =
  isDevBuild ||
  FORCE_FIREBASE_APPCHECK_DEBUG === '1' ||
  USE_FIREBASE_EMULATORS === '1';

const scheduleDebugTokenRequest = (reason, delayMs = 0) => {
  setTimeout(() => {
    try {
      console.log(
        `🔐 [Firebase App Check] Requesting debug token (${reason})...`
      );
      const request = appCheck().getToken(true);
      if (!request?.then) {
        console.log(
          '🔑 [Firebase App Check] getToken returned non-promise value:',
          request
        );
        logAppCheckDebugToken(`getToken(${reason})`, request?.token || request);
        return;
      }
      request
        .then((result) => {
          console.log(
            `🔐 [Firebase App Check] getToken resolved (${reason}):`,
            result
          );
          logAppCheckDebugToken(`getToken(${reason})`, result?.token);
        })
        .catch((err) => {
          console.log(`🔑 Error getting App Check token (${reason}):`, err);
        });
    } catch (err) {
      console.log(`🔑 Exception requesting App Check token (${reason}):`, err);
    }
  }, delayMs);
};

if (APP_CHECK_DISABLED) {
  logger.info(
    '[Firebase App Check] Disabled via DISABLE_FIREBASE_APPCHECK=1 (skipping initialization)'
  );
} else if (shouldUseDebugAppCheck) {
  try {
    const debugModeSource = isDevBuild ? 'dev build' : 'forced override';
    console.log(
      `🔐 [Firebase App Check] Debug provider enabled (${debugModeSource})`
    );
    const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider();
    rnfbProvider.configure({
      android: {
        provider: 'debug',
        debugToken: process.env.FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID || 'auto',
      },
      apple: {
        provider: 'debug',
        debugToken: process.env.FIREBASE_APPCHECK_DEBUG_TOKEN_IOS || 'auto',
      },
    });
    appCheck().initializeAppCheck({
      provider: rnfbProvider,
      isTokenAutoRefreshEnabled: true,
    });
    logger.info(
      '🔐 [Firebase App Check] Initialized with debug provider (DEV)'
    );

    // Description: Force print the debug token for registration in Firebase Console
    scheduleDebugTokenRequest('initial');
    scheduleDebugTokenRequest('retry-2s', 2000);
    scheduleDebugTokenRequest('retry-10s', 10000);
    appCheck().onTokenChanged((tokenResult) => {
      console.log('🔐 [Firebase App Check] onTokenChanged fired:', tokenResult);
      if (tokenResult?.token) {
        logAppCheckDebugToken('onTokenChanged', tokenResult.token);
      }
    });
  } catch (error) {
    logger.warn(
      '[Firebase App Check] Failed to initialize debug provider:',
      error
    );
  }
} else {
  try {
    console.log('🔐 [Firebase App Check] Using native providers (prod mode)');
    const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider();
    rnfbProvider.configure({
      android: {
        provider: 'playIntegrity',
      },
      apple: {
        provider: 'deviceCheck',
      },
    });
    appCheck().initializeAppCheck({
      provider: rnfbProvider,
      isTokenAutoRefreshEnabled: true,
    });
    logger.info(
      '🔐 [Firebase App Check] Initialized with native providers (PROD)'
    );
  } catch (error) {
    logger.error(
      '[Firebase App Check] Failed to initialize in production:',
      error
    );
  }
}

// Description: Enable Firestore offline persistence (required for React Native)
// This must be called before any Firestore operations
try {
  firestoreInstance.settings({
    persistence: true, // Enable offline persistence
    // Set 50MB cache limit (instead of unlimited) to prevent unbounded growth
    // 50MB supports ~5,000-10,000 event documents with images and user data
    cacheSizeBytes: __DEV__ ? firestore.CACHE_SIZE_UNLIMITED : 50 * 1024 * 1024,
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
let loggedTimestampFallback = false;
export const getTimestampNow = () => {
  try {
    if (firestore.Timestamp && typeof firestore.Timestamp.now === 'function') {
      return firestore.Timestamp.now();
    }
  } catch (error) {
    if (!loggedTimestampFallback) {
      logger.warn(
        '[Firebase] Timestamp.now unavailable, falling back to fromDate:',
        error?.message || error
      );
      loggedTimestampFallback = true;
    }
  }
  if (
    firestore.Timestamp &&
    typeof firestore.Timestamp.fromDate === 'function'
  ) {
    if (!loggedTimestampFallback) {
      logger.warn('[Firebase] Timestamp.now missing, using fromDate fallback');
      loggedTimestampFallback = true;
    }
    return firestore.Timestamp.fromDate(new Date());
  }
  const now = Date.now();
  if (!loggedTimestampFallback) {
    logger.warn(
      '[Firebase] Timestamp helpers missing, constructing plain timestamp'
    );
    loggedTimestampFallback = true;
  }
  return {
    seconds: Math.floor(now / 1000),
    nanoseconds: (now % 1000) * 1e6,
    toDate: () => new Date(now),
  };
};
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
    logger.error(
      '[uploadProfileImage] Upload failed:',
      error?.message || error
    );
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

// Description: Add a friend (mutual) via server callable
export const addFriend = async (currentUid, targetUid) => {
  const addFriendFn = functionsInstance.httpsCallable('addFriend');
  const res = await addFriendFn({ targetUid });
  return res?.data || { ok: true };
};

// Description: Remove a friend (mutual) via server callable
export const removeFriend = async (currentUid, targetUid) => {
  const removeFriendFn = functionsInstance.httpsCallable('removeFriend');
  const res = await removeFriendFn({ targetUid });
  return res?.data || { ok: true };
};

// Description: Request to follow (private profile) via server callable
export const requestFollow = async (currentUid, targetUid) => {
  const requestFollowFn = functionsInstance.httpsCallable('requestFollow');
  const res = await requestFollowFn({ targetUid });
  return res?.data || { ok: true };
};

// Description: Approve follow request via server callable
export const approveFollowRequest = async (currentUid, requesterUid) => {
  const approveFn = functionsInstance.httpsCallable('approveFollowRequest');
  const res = await approveFn({ requesterUid });
  return res?.data || { ok: true };
};

// Description: Deny follow request via server callable
export const denyFollowRequest = async (currentUid, requesterUid) => {
  const denyFn = functionsInstance.httpsCallable('denyFollowRequest');
  const res = await denyFn({ requesterUid });
  return res?.data || { ok: true };
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

// Description: Update user rating via server callable (enforces mutual-event rule + prevents gaming)
export const updateUserRating = async (uid, raterUid, rating) => {
  const rateUserFn = functionsInstance.httpsCallable('rateUser');
  const res = await rateUserFn({ targetUid: uid, rating });
  return res?.data || { ok: true };
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
    logger.error('Callable deleteEvent failed:', error.message || error);

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

    throw error;
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

// New: Upsert business in one step (used by simplified onboarding)
export const createOrUpdateBusiness = async (payload) =>
  callCallable('createOrUpdateBusiness', payload);

export const switchToPersonalAccount = async () =>
  callCallable('switchToPersonalAccount', {});

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
