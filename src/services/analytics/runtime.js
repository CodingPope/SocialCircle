import { getFormattedCity } from '../locationContextService';
import logger from '../../lib/logger';
import { deriveUserAnalyticsProps } from './props';
import { sanitize, toNum, safeStr } from './sanitize';

// ATT/Platform gate (set from App.js). Defaults to true for backward compatibility
let trackingAllowed = true;
export function setTrackingAllowed(on) {
  trackingAllowed = !!on;
}

let rnfa = null; // cached firebase analytics instance (or null)
let enabled = false; // runtime flag
let currentUid = null;
let currentProps = {};
let warnedMissingAnalytics = false;
let triedLoadAnalytics = false;

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

export async function analyticsInit({ optedIn, uid, props } = {}) {
  enabled = !!optedIn && trackingAllowed;
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
    await a.setAnalyticsCollectionEnabled(enabled);
    devLog(
      '[analytics] collection',
      enabled ? 'ENABLED' : 'DISABLED',
      uid ? `for uid ${uid}` : '(anonymous)'
    );

    try {
      if (typeof a.setSessionTimeoutDuration === 'function') {
        await a.setSessionTimeoutDuration(30 * 60 * 1000);
      }
    } catch {}

    if (enabled && currentUid) {
      try {
        await a.setUserId(String(currentUid));
      } catch {}
    } else {
      try {
        await a.setUserId(null);
      } catch {}
    }

    if (enabled && currentProps && typeof currentProps === 'object') {
      const entries = Object.entries(currentProps).filter(
        ([k, v]) => typeof v === 'string'
      );
      for (const [k, v] of entries) {
        try {
          await a.setUserProperty(k, v);
        } catch {}
      }
    }

    if (enabled) {
      try {
        await a.logEvent('app_open');
      } catch {}

      try {
        let city = currentProps?.home_city || null;
        if (!city) {
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

export async function setOptIn(on) {
  enabled = trackingAllowed && !!on;
  devLog('[analytics] setOptIn', enabled ? 'enabled' : 'disabled');
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

export async function screen(name, params = {}) {
  if (!enabled || !name) return;
  const a = await getRNFA();
  if (!a) return;
  try {
    const safeParams = sanitize(params);
    try {
      const city = await getFormattedCity();
      if (city) {
        safeParams.user_location = city;
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

export async function event(name, params = {}) {
  if (!enabled || !name) return;
  const a = await getRNFA();
  if (!a) return;
  try {
    const safeParams = sanitize(params);
    try {
      const city = await getFormattedCity();
      if (city) {
        safeParams.user_location = city;
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

export async function track(name, params = {}) {
  return event(name, params);
}

export async function identify(userProps = {}) {
  if (!enabled) return;
  const a = await getRNFA();
  if (!a) return;
  try {
    const safeProps = sanitize(userProps);
    await a.setUserProperties(safeProps);
  } catch {}
}

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

export { sanitize } from './sanitize';
