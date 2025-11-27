// Description: Manages user location context for analytics (city-level, privacy-safe)
// Caches location to avoid excessive API calls; updates on app foreground
import * as Location from 'expo-location';

const isValidCoords = (coords) => {
  if (!coords) return false;
  const { latitude, longitude } = coords || {};
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude)
  );
};

let cachedLocation = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes to keep location fresh
const ACCEPTABLE_ACCURACY_METERS = 5000; // ~3 miles radius for neighborhood-level context

// Description: Ordered list of accuracy levels to attempt for high fidelity without exposing exact coords
const HIGH_ACCURACY_SEQUENCE = (() => {
  const accuracy = Location.Accuracy || {};
  const sequence = [];

  if (typeof accuracy.High !== 'undefined') {
    sequence.push({ label: 'High', value: accuracy.High });
  }

  if (typeof accuracy.BestForNavigation !== 'undefined') {
    sequence.push({
      label: 'BestForNavigation',
      value: accuracy.BestForNavigation,
    });
  } else if (typeof accuracy.Highest !== 'undefined') {
    sequence.push({ label: 'Highest', value: accuracy.Highest });
  }

  const balanced =
    typeof accuracy.Balanced !== 'undefined'
      ? { label: 'Balanced', value: accuracy.Balanced }
      : null;
  const low =
    typeof accuracy.Low !== 'undefined'
      ? { label: 'Low', value: accuracy.Low }
      : null;

  if (balanced) {
    sequence.push(balanced);
  } else if (low) {
    sequence.push(low);
  }

  return sequence.length > 0
    ? sequence
    : [{ label: 'Default', value: undefined }];
})();

const requestPermissionIfNeeded = async () => {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing?.status === 'granted') return true;
    if (existing?.canAskAgain === false) return false;
  } catch {}
  try {
    const requested = await Location.requestForegroundPermissionsAsync();
    return requested?.status === 'granted';
  } catch {
    return false;
  }
};

// Description: Attempt to fetch current position with escalating accuracy until within acceptable radius
async function getPositionWithEscalation({ force = false } = {}) {
  let lastError = null;

  // Fast path: use last known to avoid hammering GPS when we just need coarse city
  if (!force && Location.getLastKnownPositionAsync) {
    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (isValidCoords(lastKnown?.coords)) {
        return lastKnown;
      }
    } catch {}
  }

  for (const { label, value } of HIGH_ACCURACY_SEQUENCE) {
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: value,
        maximumAge: 15_000,
        timeout: 20_000,
        mayShowUserSettingsDialog: force,
      });

      const accuracyRadius = position?.coords?.accuracy;


      if (
        !accuracyRadius ||
        accuracyRadius <= ACCEPTABLE_ACCURACY_METERS ||
        label ===
          HIGH_ACCURACY_SEQUENCE[HIGH_ACCURACY_SEQUENCE.length - 1].label
      ) {
        return position;
      }

      // Otherwise escalate to the next accuracy tier.
    } catch (error) {
      lastError = error;
    }
  }

  // As a final fallback, try the last known position even if accuracy attempts failed
  if (Location.getLastKnownPositionAsync) {
    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (isValidCoords(lastKnown?.coords)) {
        return lastKnown;
      }
    } catch {}
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

// Description: Get coarse location (city/region) for analytics context
// Returns { city, region, country } or null if unavailable/denied
export async function getCoarseLocation({ force = false } = {}) {
  const now = Date.now();

  // Return cached if fresh
  if (!force && cachedLocation && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedLocation;
  }

  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync?.();
    if (servicesEnabled === false) {
      cachedLocation = null;
      return null;
    }

    // Check + request permission first
    const granted = await requestPermissionIfNeeded();
    if (!granted) {
      cachedLocation = null;
      return null;
    }

    // Get current position with escalating accuracy to achieve neighborhood-level precision
    const position = await getPositionWithEscalation({ force });

    if (!position || !position.coords) {
      cachedLocation = null;
      lastFetchTime = 0;
      return null;
    }

    // Guard: ignore simulator defaults (Cupertino / San Francisco) if force refresh requested
    const roundedLat = Number(position.coords.latitude?.toFixed(4));
    const roundedLng = Number(position.coords.longitude?.toFixed(4));
    const simulatorDefaults = [
      { lat: 37.3346, lng: -122.009 }, // Apple Park (default simulator)
      { lat: 37.7749, lng: -122.4194 }, // San Francisco (test script)
    ];
    if (
      force &&
      simulatorDefaults.some(
        (loc) =>
          Math.abs(loc.lat - roundedLat) < 0.0002 &&
          Math.abs(loc.lng - roundedLng) < 0.0002
      )
    ) {
      cachedLocation = null;
      lastFetchTime = 0;
      return null;
    }

    // Reverse geocode to city/region
    const [geocode] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });

    if (geocode) {
      cachedLocation = {
        city: geocode.city || geocode.subregion || null,
        region: geocode.region || geocode.isoCountryCode || null,
        country: geocode.country || geocode.isoCountryCode || null,
      };
      lastFetchTime = now;
      return cachedLocation;
    }

    return null;
  } catch (error) {
    // Silent fail for permission denied, timeout, etc.
    return null;
  }
}

// Description: Clear cached location (useful for testing or manual refresh)
export function clearLocationCache() {
  cachedLocation = null;
  lastFetchTime = 0;
}

// Description: Force-refresh location (bypasses cache and ignores simulator defaults)
export async function refreshLocation() {
  return getCoarseLocation({ force: true });
}

// Description: Get formatted city string for analytics (e.g., "San Francisco, CA")
export async function getFormattedCity() {
  const loc = await getCoarseLocation();
  if (!loc) return null;

  if (loc.city && loc.region) {
    return `${loc.city}, ${loc.region}`;
  }
  if (loc.city) {
    return loc.city;
  }
  if (loc.region) {
    return loc.region;
  }
  return null;
}
