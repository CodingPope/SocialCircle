// src/lib/push.js
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useUserStore } from '../store/userStore';

// Foreground behavior (optional)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPushTokenAsync() {
  // iOS: ask permission
  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  // Get Expo push token
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId;

  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const expoPushToken = tokenData?.data || null;
  return expoPushToken;
}

// NEW: ask permission, get token, and SAVE it (never writes empty)
export async function initPushForUser(uid) {
  if (!uid) return;
  try {
    const token = await registerForPushTokenAsync();
    if (!token) return;

    await updateDoc(doc(db, 'users', uid), {
      deviceToken: token,
      pushOptIn: true,
      updatedAt: serverTimestamp(),
    });

    // keep Zustand mirror in sync if you store the user locally
    const setUser = useUserStore.getState().setUser;
    const current = useUserStore.getState().user || {};
    setUser({ ...current, deviceToken: token, pushOptIn: true });
  } catch (e) {
    console.warn('[push] Failed to init push token:', e?.message || e);
  }
}
