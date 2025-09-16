// Discovery queries with TTL wrapper.
import { getWithTTL } from '../lib/ttlCache';

// Simulated backend fetch for hot events
async function fetchHotRaw(
  categories = [],
  location = { latitude: 0, longitude: 0 }
) {
  // Return empty list placeholder.
  return [];
}

export async function fetchHotEvents(categories, location, ttlMs = 60 * 1000) {
  return getWithTTL(
    `hot:${categories.sort().join(',')}`,
    () => fetchHotRaw(categories, location),
    ttlMs
  );
}
