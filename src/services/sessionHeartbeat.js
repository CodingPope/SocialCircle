import AsyncStorage from '@react-native-async-storage/async-storage';
import { serverTimestamp } from '../firebase/config';
import { mergeUserFields } from '../features/profile/services/userService';
import { event as analyticsEvent } from './analytics';
import { trackSessionStart } from '../lib/analytics';

const STORAGE_KEY_PREFIX = 'session:last:uid:';

function getStorageKey(uid) {
  return `${STORAGE_KEY_PREFIX}${uid}`;
}

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function recordDailySessionHeartbeat(user) {
  const uid = user?.uid;
  if (!uid) return;

  const storageKey = getStorageKey(uid);
  const today = getTodayKey();

  let shouldRecord = true;
  try {
    const lastRecorded = await AsyncStorage.getItem(storageKey);
    if (lastRecorded === today) shouldRecord = false;
  } catch (err) {
    console.warn('sessionHeartbeat: failed to read cache', err?.message || err);
  }

  if (!shouldRecord) return;

  try {
    await AsyncStorage.setItem(storageKey, today);
  } catch (err) {
    console.warn('sessionHeartbeat: failed to write cache', err?.message || err);
  }

  try {
    await mergeUserFields(uid, {
      lastActiveAt: serverTimestamp(),
      lastSessionCadence: 'daily',
    });
  } catch (err) {
    console.warn('sessionHeartbeat: failed to update user doc', err?.message || err);
  }

  try {
    await analyticsEvent('session_start', { cadence: 'daily', trigger: 'auth_resolved' });
  } catch {}

  try {
    await trackSessionStart({ cadence: 'daily', trigger: 'auth_resolved' });
  } catch {}
}

export default { recordDailySessionHeartbeat };
