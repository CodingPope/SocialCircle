// Description: Privacy-first analytics service.
// - Opt-in required: respects user.analyticsOptIn (false by default)
// - Dynamic import of @react-native-firebase/analytics if available; otherwise no-op
// - Never includes precise PII. Only logs coarse, non-identifying params when enabled
// - Exposes helpers: init, setOptIn, screen, event, identify, isEnabled

let rnfa = null; // cached firebase analytics instance (or null)
let enabled = false; // runtime flag
let currentUid = null;

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

// Runtime env helper: detect Expo Go (no custom native modules available)
function isExpoGo() {
  try {
    const Constants = require('expo-constants').default;
    return Constants?.appOwnership === 'expo';
  } catch {
    return false;
  }
}

async function getRNFA() {
  if (rnfa !== null) return rnfa;
  try {
    // Skip in Expo Go to avoid NativeModule access
    if (isExpoGo()) {
      rnfa = null;
      return rnfa;
    }
    // Lazy require to avoid crashes in environments without native module configured
    const analyticsMod = require('@react-native-firebase/analytics').default;
    rnfa = typeof analyticsMod === 'function' ? analyticsMod() : null;
  } catch (e) {
    rnfa = null; // fallback to no-op
  }
  return rnfa;
}

export function isEnabled() {
  return enabled === true;
}

// Description: Initialize analytics for a user session
// user: { uid, analyticsOptIn?: boolean, interests?: string[] }
export async function init(user) {
  currentUid = user?.uid || null;
  enabled = user?.analyticsOptIn === true;
  const a = await getRNFA();
  if (!a) return;
  try {
    await a.setAnalyticsCollectionEnabled(enabled);
    if (enabled && currentUid) {
      // Avoid setting raw PII as user properties
      await a.setUserId(currentUid);
      const interestsCount = Array.isArray(user?.interests)
        ? Math.min(user.interests.length, 50)
        : 0;
      await a.setUserProperties({ interests_count: String(interestsCount) });
    } else {
      // Clear user context when disabled/signed-out
      await a.setUserId(null);
    }
  } catch {}
}

// Description: Toggle analytics collection for the current device
export async function setOptIn(on) {
  enabled = !!on;
  const a = await getRNFA();
  if (!a) return;
  try {
    await a.setAnalyticsCollectionEnabled(enabled);
  } catch {}
}

// Description: Record a screen view (generic). No-ops if disabled
export async function screen(name, params = {}) {
  if (!enabled || !name) return;
  const a = await getRNFA();
  if (!a) return;
  try {
    await a.logScreenView({
      screen_name: name,
      screen_class: name,
      ...sanitize(params),
    });
  } catch {}
}

// Description: Record a generic event (ensure safe params)
export async function event(name, params = {}) {
  if (!enabled || !name) return;
  const a = await getRNFA();
  if (!a) return;
  try {
    await a.logEvent(name, sanitize(params));
  } catch {}
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
function sanitize(obj) {
  try {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (v == null) continue;
      // Drop obvious PII keys
      const lower = k.toLowerCase();
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
        if (masked) out[k] = masked;
        continue;
      }

      if (typeof v === 'number') {
        // If it looks like coordinates, coarse round to 1 decimal (~11km)
        if (lower.includes('lat') || lower.includes('lng')) {
          out[k] = Math.round(v * 10) / 10;
        } else {
          out[k] = v;
        }
      } else if (typeof v === 'string') {
        out[k] = v.slice(0, 100);
      } else if (Array.isArray(v)) {
        out[k] = v
          .slice(0, 10)
          .map((x) => (typeof x === 'string' ? x.slice(0, 40) : x));
      } else if (typeof v === 'object') {
        // shallow sanitize
        out[k] = '[object]';
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
