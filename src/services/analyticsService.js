// Description: Privacy-first analytics service.
// - Opt-in required: respects user.analyticsOptIn (false by default)
// - Dynamic import of @react-native-firebase/analytics if available; otherwise no-op
// - Never includes precise PII. Only logs coarse, non-identifying params when enabled
// - Exposes helpers: init, setOptIn, screen, event, identify, isEnabled
// - Automatically includes city-level location context for Firebase Realtime map

import { getFormattedCity } from './locationContextService';
import logger from '../lib/logger';

let rnfa = null; // cached firebase analytics instance (or null)
let enabled = false; // runtime flag
let currentUid = null;
let currentProps = {};
let warnedMissingAnalytics = false;
let triedLoadAnalytics = false;

// Description: Lightweight dev log helpers so we can trace analytics lifecycle without noisy production logs
const devLog = (...args) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    logger.debug(...args);
  }
};

const devWarn = (...args) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    logger.warn(...args);
  }
};

function maskId(value) {
  try {
    const str = String(value || '').trim();
    if (!str) return null;
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // force 32-bit
    }
    const positive = Math.abs(hash);
    return positive.toString(36).slice(0, 16);
  } catch {
    return null;
  }
}

async function getRNFA() {
  if (triedLoadAnalytics) return rnfa;
  triedLoadAnalytics = true;
  try {
    // Lazy require to avoid crashes in environments without native module configured
    const analyticsMod = require('@react-native-firebase/analytics').default;
    devLog(
      '[analytics] native module export',
      analyticsMod ? 'resolved' : 'missing'
    );
    rnfa = typeof analyticsMod === 'function' ? analyticsMod() : null;
    devLog(
      '[analytics] native module instance',
      rnfa ? 'initialized' : 'unavailable'
    );
  } catch (e) {
    devWarn('[analytics] failed to load native module', e?.message || e);
    rnfa = null; // fallback to no-op
  }
  return rnfa;
}

export function isEnabled() {
  return enabled === true;
}

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  return null;
}

function computeAge(dob) {
  const date = toDateSafe(dob);
  if (!date) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 120 ? age : null;
}

function getAgeBracket(dob) {
  const age = computeAge(dob);
  if (age == null) return null;
  if (age < 18) return 'under_18';
  if (age <= 24) return '18_24';
  if (age <= 34) return '25_34';
  if (age <= 44) return '35_44';
  if (age <= 54) return '45_54';
  return '55_plus';
}

function normalizeSex(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return null;
  if (['female', 'f', 'woman'].includes(raw)) return 'female';
  if (['male', 'm', 'man'].includes(raw)) return 'male';
  if (['nonbinary', 'non-binary', 'non_binary', 'nb'].includes(raw))
    return 'non_binary';
  if (['prefer_not_say', 'prefer not to say'].includes(raw))
    return 'prefer_not_say';
  return 'other';
}

function sanitizePropValue(value, { lowercase = false, max = 24 } = {}) {
  if (value == null) return null;
  let str = String(value).trim();
  if (!str) return null;
  if (lowercase) str = str.toLowerCase();
  if (str.length > max) str = str.slice(0, max);
  return str;
}

export function deriveUserAnalyticsProps(user = {}) {
  const props = {};
  const plan = sanitizePropValue(user?.plan || 'free', {
    lowercase: true,
    max: 24,
  });
  if (plan) props.plan = plan;

  const interestCount = Array.isArray(user?.interests)
    ? Math.min(user.interests.length, 99)
    : 0;
  props.interests_count = String(interestCount);

  const ageBracket = getAgeBracket(user?.dob);
  if (ageBracket) props.age_bracket = ageBracket;

  const sex = normalizeSex(user?.sex);
  if (sex) props.sex = sex;
  else props.sex = 'unknown';

  const cityCandidate =
    sanitizePropValue(user?.city, { max: 24 }) ||
    sanitizePropValue(user?.location?.city, { max: 24 }) ||
    sanitizePropValue(user?.location?.label, { max: 24 });
  if (cityCandidate) props.home_city = cityCandidate;

  props.push_opt_in = user?.pushOptIn ? 'true' : 'false';

  return props;
}

// Description: Initialize analytics for a user session
// user: { uid, analyticsOptIn?: boolean, interests?: string[] }
// New: Initialize analytics based on explicit consent at runtime.
// Keeps native module lazy-loading via getRNFA() so this is safe in Expo Go.
// Accepts either a user-like object or the explicit shape used elsewhere.
export async function analyticsInit({ optedIn, uid, props } = {}) {
  // update runtime flags
  enabled = !!optedIn;
  currentUid = uid || null;
  currentProps = props && typeof props === 'object' ? { ...props } : {};

  const a = await getRNFA();
  if (!a) {
    if (enabled && !warnedMissingAnalytics) {
      warnedMissingAnalytics = true;
      logger.warn(
        '[analytics] Firebase Analytics native module unavailable; events will not be sent.'
      );
    }
    devWarn('[analytics] init skipped - native module unavailable');
    return;
  }
  warnedMissingAnalytics = false;

  try {
    // Explicitly control collection at runtime (plist default should be OFF)
    await a.setAnalyticsCollectionEnabled(enabled);
    devLog(
      '[analytics] collection',
      enabled ? 'ENABLED' : 'DISABLED',
      uid ? `for uid ${uid}` : '(anonymous)'
    );

    // Optional: tweak session timeout (30 minutes)
    try {
      if (typeof a.setSessionTimeoutDuration === 'function') {
        await a.setSessionTimeoutDuration(30 * 60 * 1000);
      }
    } catch (e) {
      // noop
    }

    if (enabled && currentUid) {
      try {
        // Avoid setting raw PII as user id/property values
        await a.setUserId(String(currentUid));
      } catch (e) {}
    } else {
      try {
        await a.setUserId(null);
      } catch (e) {}
    }

    if (enabled && currentProps && typeof currentProps === 'object') {
      const entries = Object.entries(currentProps).filter(
        ([k, v]) => typeof v === 'string'
      );
      for (const [k, v] of entries) {
        try {
          await a.setUserProperty(k, v);
        } catch (e) {}
      }
    }

    if (enabled) {
      try {
        await a.logEvent('app_open');
      } catch (e) {}

      // Description: Set automatic location for Firebase Realtime map (city-level, privacy-safe)
      // This enables the geographic map in Firebase Analytics dashboard
      try {
        // Derive location from user props if available
        let city = currentProps?.home_city || null;
        if (!city) {
          // Fallback to device city when profile metadata is missing
          city = await getFormattedCity();
        }

        if (city) {
          devLog('[analytics] setting location context:', city);

          if (typeof a.setUserProperty === 'function') {
            try {
              await a.setUserProperty('user_location', city);
            } catch (propError) {
              devWarn(
                '[analytics] setUserProperty user_location failed',
                propError?.message || propError
              );
            }
          }

          if (typeof a.setDefaultEventParameters === 'function') {
            try {
              await a.setDefaultEventParameters({ user_location: city });
            } catch (paramError) {
              devWarn(
                '[analytics] setDefaultEventParameters failed',
                paramError?.message || paramError
              );
            }
          }
        } else {
          devLog('[analytics] location context unavailable');
        }
      } catch (e) {
        devWarn('[analytics] location context failed', e?.message || e);
      }
    }
  } catch (e) {
    devWarn('[analytics] init failed', e?.message || e);
  }
}

// Backwards-compatible wrapper: accept the original user shape
export async function init(user) {
  const optedIn = user?.analyticsOptIn === true;
  const uid = user?.uid || null;
  const interestsCount = Array.isArray(user?.interests)
    ? Math.min(user.interests.length, 50)
    : 0;
  const userProps = deriveUserAnalyticsProps(user);
  if (!('interests_count' in userProps)) {
    userProps.interests_count = String(interestsCount);
  }
  return analyticsInit({ optedIn, uid, props: userProps });
}

// Description: Toggle analytics collection for the current device
export async function setOptIn(on) {
  enabled = !!on;
  devLog('[analytics] setOptIn', enabled ? 'enabled' : 'disabled');
  // Ensure that toggling opt-in triggers full initialization behavior
  // (collection flag, session timeout, user id/properties) when available.
  try {
    await analyticsInit({
      optedIn: enabled,
      uid: currentUid,
      props: currentProps,
    });
  } catch (error) {
    devWarn('[analytics] setOptIn error', error?.message || error);
  }
}

// Description: Record a screen view (generic). No-ops if disabled
export async function screen(name, params = {}) {
  if (!enabled || !name) return;
  const a = await getRNFA();
  if (!a) return;
  try {
    const safeParams = sanitize(params);

    // Add location context for Realtime map (Firebase reserved: no leading underscore)
    try {
      const city = await getFormattedCity();
      if (city) {
        safeParams.user_location = city;

        // Update user property and default parameters if location changed
        // This ensures the Realtime map updates when permission is granted after init
        if (city !== currentProps?.user_location) {
          currentProps.user_location = city;
          try {
            await a.setUserProperty('user_location', city);
            await a.setDefaultEventParameters({ user_location: city });
            devLog('[analytics] updated location context:', city);
          } catch (updateError) {
            devWarn(
              '[analytics] failed to update location context:',
              updateError?.message || updateError
            );
          }
        }
      }
    } catch {}

    devLog('[analytics] screen', name, safeParams);
    await a.logScreenView({
      screen_name: name,
      screen_class: name,
      ...safeParams,
    });
  } catch {}
}

// Description: Record a generic event (ensure safe params)
export async function event(name, params = {}) {
  if (!enabled || !name) return;
  const a = await getRNFA();
  if (!a) return;
  try {
    const safeParams = sanitize(params);

    // Add location context for Realtime map (Firebase reserved: no leading underscore)
    try {
      const city = await getFormattedCity();
      if (city) {
        safeParams.user_location = city;

        // Update user property and default parameters if location changed
        // This ensures the Realtime map updates when permission is granted after init
        if (city !== currentProps?.user_location) {
          currentProps.user_location = city;
          try {
            await a.setUserProperty('user_location', city);
            await a.setDefaultEventParameters({ user_location: city });
            devLog('[analytics] updated location context:', city);
          } catch (updateError) {
            devWarn(
              '[analytics] failed to update location context:',
              updateError?.message || updateError
            );
          }
        }
      }
    } catch {}

    devLog('[analytics] event', name, safeParams);
    await a.logEvent(name, safeParams);
  } catch {}
}

// Alias to match common naming in app code: track(name, params)
export async function track(name, params = {}) {
  return event(name, params);
}

// Description: Identify user with coarse properties only
export async function identify(userProps = {}) {
  if (!enabled) return;
  const a = await getRNFA();
  if (!a) return;
  try {
    const safeProps = sanitize(userProps);
    await a.setUserProperties(safeProps);
  } catch {}
}

// Safe params: strip potentially sensitive values like emails, full addresses, exact lat/lng
// Also ensures parameter names are Firebase-compliant (alphanumeric + underscore, 1-40 chars, no leading underscore)
function sanitize(obj) {
  try {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (v == null) continue;

      // Validate parameter name according to Firebase rules
      // - 1-40 characters
      // - Alphanumeric + underscore only
      // - Must NOT start with underscore (reserved for Firebase)
      // - Must NOT be empty or only whitespace
      const trimmedKey = String(k).trim();
      if (!trimmedKey || trimmedKey.length === 0 || trimmedKey.length > 40) {
        continue;
      }
      if (
        trimmedKey.startsWith('_') ||
        trimmedKey.startsWith('firebase_') ||
        trimmedKey.startsWith('google_') ||
        trimmedKey.startsWith('ga_')
      ) {
        continue; // Reserved prefixes
      }
      if (!/^[a-zA-Z0-9_]+$/.test(trimmedKey)) {
        continue; // Invalid characters
      }

      // Drop obvious PII keys
      const lower = trimmedKey.toLowerCase();
      if (
        lower.includes('email') ||
        lower.includes('phone') ||
        lower.includes('token') ||
        lower.includes('address') ||
        lower.includes('image') ||
        lower.includes('photo') ||
        lower.includes('name') // avoid full names
      )
        continue;

      if (lower.includes('id')) {
        const masked = maskId(v);
        if (masked) out[trimmedKey] = masked;
        continue;
      }

      if (typeof v === 'number') {
        // If it looks like coordinates, coarse round to 1 decimal (~11km)
        if (lower.includes('lat') || lower.includes('lng')) {
          out[trimmedKey] = Math.round(v * 10) / 10;
        } else {
          out[trimmedKey] = v;
        }
      } else if (typeof v === 'string') {
        const trimmedValue = v.trim();
        if (trimmedValue.length > 0) {
          out[trimmedKey] = trimmedValue.slice(0, 100);
        }
      } else if (Array.isArray(v)) {
        out[trimmedKey] = v
          .slice(0, 10)
          .map((x) => (typeof x === 'string' ? x.slice(0, 40) : x));
      } else if (typeof v === 'object') {
        // shallow sanitize
        out[trimmedKey] = '[object]';
      }
    }
    return out;
  } catch {
    return {};
  }
}

// Convenience helpers for common app events
export async function trackJoinEventSafe({ capacity, attendeeCount, privacy }) {
  return event('join_event', {
    capacity: toNum(capacity),
    attendee_count: toNum(attendeeCount),
    privacy: safeStr(privacy),
  });
}

export async function trackCreateEventSafe({ privacy, hasImage, category }) {
  return event('create_event', {
    privacy: safeStr(privacy),
    has_image: !!hasImage,
    category: safeStr(category),
  });
}

export async function trackFilterApplySafe({ interestsCount, genderOnly }) {
  return event('filter_apply', {
    interests_count: toNum(interestsCount),
    gender_only: !!genderOnly,
  });
}

function toNum(n) {
  return typeof n === 'number' && isFinite(n) ? n : 0;
}
function safeStr(s) {
  return typeof s === 'string' ? s.slice(0, 40) : String(s || '');
}
