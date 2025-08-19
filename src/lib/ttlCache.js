// Description: Tiny AsyncStorage-backed TTL cache helper.
// Store shape: { value: any, ts: epoch_ms, ttlMs: number }
// Behavior:
// - getIfFresh(key, ttlMs): returns cached value if not stale; otherwise null
// - getWithTTL(key, fetcher, ttlMs): returns cached if fresh else calls fetcher, stores, returns
// - setWithTTL / invalidate: helpers to manage cache entries
// Notes: JSON-serializes values; guards parse errors; stale or missing returns null.

import AsyncStorage from '@react-native-async-storage/async-storage';

const NS = '@ttl:'; // namespace prefix

export async function getIfFresh(key, ttlMs) {
  try {
    const raw = await AsyncStorage.getItem(NS + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > ttlMs) return null;
    return parsed.value;
  } catch {
    // Corrupted JSON or storage error => treat as miss
    return null;
  }
}

export async function setWithTTL(key, value, ttlMs) {
  try {
    const payload = { value, ts: Date.now(), ttlMs };
    await AsyncStorage.setItem(NS + key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export async function invalidate(key) {
  try {
    await AsyncStorage.removeItem(NS + key);
  } catch {}
}

// getWithTTL: returns cached if fresh; otherwise calls fetcher(), stores, returns
export async function getWithTTL(key, fetcher, ttlMs) {
  const cached = await getIfFresh(key, ttlMs);
  if (cached != null) return cached;
  const value = await fetcher();
  // Only cache serializable values
  await setWithTTL(key, value, ttlMs);
  return value;
}

// Optional: background refresh helper
export async function backgroundRefresh(key, fetcher, ttlMs) {
  try {
    const value = await fetcher();
    await setWithTTL(key, value, ttlMs);
  } catch {}
}
