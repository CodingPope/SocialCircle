// Description: Simple AsyncStorage backed TTL cache utilities used in tests and discovery flows.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'ttl:';

// internal helper
async function readRaw(key) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeRaw(key, value) {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export async function getIfFresh(key, ttlMs) {
  const data = await readRaw(key);
  if (!data) return null;
  const { value, ts } = data;
  if (typeof ts !== 'number') return null;
  if (Date.now() - ts > ttlMs) return null;
  return value;
}

export async function setWithTTL(key, value, ttlMs) {
  await writeRaw(key, { value, ts: Date.now(), ttlMs });
}

export async function getWithTTL(key, fetcher, ttlMs) {
  const fresh = await getIfFresh(key, ttlMs);
  if (fresh != null) return fresh;
  const value = await fetcher();
  await setWithTTL(key, value, ttlMs);
  return value;
}

export async function invalidate(key) {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {}
}

export async function purgeExpired(keys, ttlMs) {
  for (const k of keys) {
    const v = await getIfFresh(k, ttlMs);
    if (v == null) await invalidate(k);
  }
}

export async function clearAll() {
  // naive clear: list not available; rely on caller to manage keys.
}

export async function backgroundRefresh(key, fetcher, ttlMs) {
  try {
    const value = await fetcher();
    await setWithTTL(key, value, ttlMs);
  } catch {}
}

const ttlCache = {
  getIfFresh,
  setWithTTL,
  getWithTTL,
  invalidate,
  purgeExpired,
  clearAll,
  backgroundRefresh,
};

export default ttlCache;
