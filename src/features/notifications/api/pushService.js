// src/services/notifications/pushService.js
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  db,
  serverTimestamp,
  functions as firebaseFunctions,
} from '../../../services/firebase';
import { useUserStore } from '../../profile';
import { EAS_PROJECT_ID } from '@env';
import logger from '../../../lib/logger';

// Foreground behavior (optional)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {}
}

export async function registerForPushTokenAsync() {
  try {
    await ensureAndroidChannel();

    // iOS: ask permission
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    // Get Expo push token
    const inferredId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId ||
      EAS_PROJECT_ID ||
      null;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      inferredId ? { projectId: inferredId } : undefined
    );
    const token = tokenData?.data || null;
    if (
      !token ||
      typeof token !== 'string' ||
      !token.startsWith('ExponentPushToken')
    ) {
      return null;
    }
    return token;
  } catch (e) {
    logger.warn('[push] token error:', e?.message || e);
    return null;
  }
}

// NEW: ask permission, get token, and SAVE it (never writes empty)
export async function initPushForUser(uid) {
  if (!uid) return;
  try {
    const token = await registerForPushTokenAsync();
    if (!token) return;

    // Ensure user profile exists before writing (business accounts might not have one)
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return; // skip for business accounts

    // Use a server callable to claim the token (removes it from other users if needed)
    try {
      const claimFn = firebaseFunctions.httpsCallable('claimDeviceToken');
      await claimFn({ token, uid, devicePlatform: Platform.OS });
    } catch (e) {
      // Fallback: best-effort local update (may be denied by rules in some cases)
      await userRef.update({
        deviceToken: token,
        pushOptIn: true,
        devicePlatform: Platform.OS,
        deviceUpdatedAt: serverTimestamp(),
      });
    }

    // keep Zustand mirror in sync if you store the user locally
    const setUser = useUserStore.getState().setUser;
    const current = useUserStore.getState().user || {};
    if (typeof setUser === 'function') {
      setUser({ ...current, deviceToken: token, pushOptIn: true });
    }
  } catch (e) {
    logger.warn('[push] Failed to init push token:', e?.message || e);
  }
}
