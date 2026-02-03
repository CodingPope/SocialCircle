// Description: Lightweight client tracker that sends sanitized analytics events to a server Cloud Function.
// - Respects in-app analytics opt-in via services/analyticsService.isEnabled
// - Uses callable function 'trackEvent' (us-central1)
// - Best-effort: never throws
// - Uses React Native Firebase for native mobile analytics

import { functions, auth } from '../services/firebase';
import logger from './logger';
import {
  event as analyticsEvent,
  isEnabled as analyticsIsEnabled,
} from '../services/analyticsService';

// Event taxonomy: standard names used across app surfaces
// Naming: snake_case event names and payload keys. No lat/lng or PII.
export const AnalyticsEvents = Object.freeze({
  CARD_IMPRESSION: 'card_impression',
  CARD_CLICK: 'card_click',
  OPEN_EVENT: 'open_event',
  SAVE_EVENT: 'save_event', // may be stubbed until feature exists
  SHARE_EVENT: 'share_event', // may be stubbed until feature exists
  RSVP_YES: 'rsvp_yes',
  RSVP_NO: 'rsvp_no',
  JOIN_EVENT: 'join_event',
  CHECK_IN: 'check_in', // may be stubbed until feature exists
  REPORT_CONTENT: 'report_content',
  ONBOARDING_STEP_COMPLETE: 'onboarding_step_complete',
  ONBOARDING_DONE: 'onboarding_done',
  SESSION_START: 'session_start',
});

// Common surfaces and sources for cross-feature consistency
export const AnalyticsSurfaces = Object.freeze({
  MAP: 'map',
  DISCOVER: 'discover',
  MY_CIRCLE: 'my_circle',
  EVENT_DETAIL: 'event_detail',
  PROFILE: 'profile',
  CHAT: 'chat',
  NOTIFICATIONS: 'notifications',
  OTHER: 'other',
});

export const AnalyticsSources = Object.freeze({
  CARD: 'card',
  PIN: 'pin',
  DEEP_LINK: 'deep_link',
  PUSH: 'push',
  CHAT: 'chat',
  SAVED: 'saved',
  SEARCH: 'search',
  RECIRCULATION: 'recirculation',
  OTHER: 'other',
});

// Parameter schemas per event. Only allowlisted keys are forwarded.
// Required keys must be present; optional keys are passed if provided.
const EVENT_SCHEMAS = {
  card_impression: {
    required: ['card_type', 'card_id'],
    optional: [
      'position',
      'surface',
      'feed_type',
      'experiment',
      'variant',
      'interest',
      'category',
    ],
  },
  card_click: {
    required: ['card_type', 'card_id'],
    optional: [
      'position',
      'surface',
      'feed_type',
      'experiment',
      'variant',
      'interest',
      'category',
    ],
  },
  open_event: {
    required: ['event_id'],
    optional: ['source', 'surface', 'origin_event_id', 'interest', 'category'],
  },
  save_event: {
    required: ['event_id'],
    optional: ['source', 'surface', 'saved', 'interest', 'category'],
  },
  share_event: {
    required: ['event_id', 'channel'], // channel: sms|link|ios_share|android_share|whatsapp|...
    optional: ['source', 'surface', 'interest', 'category'],
  },
  rsvp_yes: {
    required: ['event_id'],
    optional: [
      'capacity',
      'attendee_count',
      'was_waitlisted',
      'surface',
      'source',
      'interest',
      'category',
    ],
  },
  rsvp_no: {
    required: ['event_id'],
    optional: ['reason', 'surface', 'source'], // reason: time_conflict|not_interested|other
  },
  join_event: {
    required: ['event_id'],
    optional: [
      'method',
      'was_waitlisted',
      'surface',
      'source',
      'interest',
      'category',
    ], // method: rsvp|invite|link
  },
  check_in: {
    required: ['event_id'],
    optional: ['method', 'distance_m', 'surface', 'interest', 'category'], // method: qr|manual (future)
  },
  report_content: {
    required: ['content_type', 'content_id', 'reason_category'],
    optional: ['event_id', 'severity', 'surface'], // content_type: event|user|message
  },
  onboarding_step_complete: {
    required: ['step'],
    optional: ['duration_ms', 'source', 'retry_count'],
  },
  onboarding_done: {
    required: [],
    optional: ['total_duration_ms', 'steps', 'source'],
  },
  session_start: {
    required: [],
    optional: ['cadence', 'trigger'],
  },
};

let cf = null; // cached callable
const loggedCallableWarnings = new Set();

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Convert camelCase keys to snake_case for consistency
function toSnake(str) {
  return String(str)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

// Pick only allowlisted keys and coerce primitive types
function pickForSchema(eventName, payload) {
  const schema = EVENT_SCHEMAS[eventName];
  if (!schema) return null;
  const out = {};
  const allow = new Set([
    ...(schema.required || []),
    ...(schema.optional || []),
  ]);
  for (const [k, v] of Object.entries(payload || {})) {
    const key = toSnake(k);
    if (!allow.has(key)) continue;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      out[key] = v;
    } else if (v == null) {
      // skip undefined/null
    } else {
      // stringify small objects for robustness
      try {
        out[key] = JSON.stringify(v).slice(0, 200);
      } catch {}
    }
  }
  // Ensure required keys present
  for (const req of schema.required || []) {
    if (!(req in out)) return null;
  }
  return out;
}

// Strip PII-ish fields and trim payload size
function sanitize(value, depth = 0) {
  if (depth > 4) return null; // cap nesting
  if (value == null) return null;

  const t = typeof value;
  if (t === 'string') {
    const s = value.toString();
    // Remove emails and obvious tokens
    const noEmail = s.replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      '[redacted]'
    );
    const noBearer = noEmail.replace(
      /(ya29\.|eyJ|Bearer\s+[A-Za-z0-9\-_.]+)/g,
      '[redacted]'
    );
    return noBearer.slice(0, 200);
  }
  if (t === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (t === 'boolean') return value;
  if (Array.isArray(value))
    return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (isPlainObject(value)) {
    const out = {};
    const entries = Object.entries(value).slice(0, 40);
    for (const [k, v] of entries) {
      const key = String(k).slice(0, 40).toLowerCase();
      // Drop common PII keys
      if (
        key.includes('email') ||
        key.includes('password') ||
        key.includes('token') ||
        key.includes('secret') ||
        key.includes('address') ||
        key.includes('lat') ||
        key.includes('lng') ||
        key.includes('longitude') ||
        key.includes('latitude')
      ) {
        continue;
      }
      out[key] = sanitize(v, depth + 1);
    }
    return out;
  }
  return null;
}

export async function track(name, payload = {}) {
  try {
    if (!name || typeof name !== 'string') return;

    if (typeof analyticsIsEnabled === 'function' && !analyticsIsEnabled()) {
      return;
    }

    if (!cf) {
      cf = functions.httpsCallable('trackEvent');
    }

    const safeName = name
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 64);
    const safePayload = isPlainObject(payload) ? sanitize(payload) : {};

    // Log to native Firebase Analytics
    try {
      await analyticsEvent(safeName, safePayload);
    } catch (analyticsError) {
      // Silently fail - native analytics is best-effort, no need to warn
      // This can fail during app initialization or if analytics is disabled
    }

    // Also track via Cloud Function for server-side processing
    try {
      await cf({ name: safeName, payload: safePayload });
    } catch (callableError) {
      const code = callableError?.code || '';
      const message = callableError?.message || String(callableError);

      // Handle authentication errors (both formats: 'UNAUTHENTICATED' and 'functions/unauthenticated')
      const codeUpper = String(code).toUpperCase();
      const messageUpper = String(message).toUpperCase();

      if (
        code === 'functions/unauthenticated' ||
        code === 'unauthenticated' ||
        codeUpper === 'UNAUTHENTICATED' ||
        messageUpper.includes('UNAUTHENTICATED')
      ) {
        // Authentication errors are expected during auth state transitions
        // Analytics should never block or retry - just log once and continue
        // Native Firebase Analytics will still track locally
        if (!loggedCallableWarnings.has('auth-skip')) {
          console.info(
            '[Analytics] Server-side tracking skipped during auth transition. Local analytics continues normally.'
          );
          loggedCallableWarnings.add('auth-skip');
        }
        return; // Silently skip - don't retry
      }

      // Handle unavailable/service errors
      const isUnavailable =
        code === 'functions/unavailable' ||
        code === 'unavailable' ||
        codeUpper === 'UNAVAILABLE' ||
        messageUpper.includes('UNAVAILABLE');

      if (isUnavailable) {
        if (!loggedCallableWarnings.has('unavailable')) {
          console.info(
            '[Analytics] Server temporarily unavailable. Local analytics continues normally.'
          );
          loggedCallableWarnings.add('unavailable');
        }
        return;
      }

      // Log other errors only once per error type to avoid spam
      const errorKey = `${code || 'unknown'}-${
        message?.slice(0, 30) || 'no-msg'
      }`;
      if (!loggedCallableWarnings.has(errorKey)) {
        logger.warn(
          '[Analytics] Server tracking failed:',
          code || 'unknown',
          message?.slice(0, 80)
        );
        loggedCallableWarnings.add(errorKey);
      }
    }
  } catch (error) {
    // Never throw from analytics - it's best-effort
    if (!loggedCallableWarnings.has('track-outer-error')) {
      logger.warn('[Analytics] Unexpected error:', error?.message);
      loggedCallableWarnings.add('track-outer-error');
    }
  }
}

// Convenience helpers with minimal validation against schemas
// These return a Promise but swallow errors just like track()
export function trackCardImpression(p) {
  const payload = pickForSchema(AnalyticsEvents.CARD_IMPRESSION, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.CARD_IMPRESSION, payload);
}

export function trackCardClick(p) {
  const payload = pickForSchema(AnalyticsEvents.CARD_CLICK, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.CARD_CLICK, payload);
}

export function trackOpenEvent(p) {
  const payload = pickForSchema(AnalyticsEvents.OPEN_EVENT, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.OPEN_EVENT, payload);
}

export function trackSaveEvent(p) {
  const payload = pickForSchema(AnalyticsEvents.SAVE_EVENT, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.SAVE_EVENT, payload);
}

export function trackShareEvent(p) {
  const payload = pickForSchema(AnalyticsEvents.SHARE_EVENT, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.SHARE_EVENT, payload);
}

export function trackRsvpYes(p) {
  const payload = pickForSchema(AnalyticsEvents.RSVP_YES, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.RSVP_YES, payload);
}

export function trackRsvpNo(p) {
  const payload = pickForSchema(AnalyticsEvents.RSVP_NO, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.RSVP_NO, payload);
}

export function trackJoinEvent(p) {
  const payload = pickForSchema(AnalyticsEvents.JOIN_EVENT, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.JOIN_EVENT, payload);
}

export function trackCheckIn(p) {
  const payload = pickForSchema(AnalyticsEvents.CHECK_IN, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.CHECK_IN, payload);
}

export function trackReportContent(p) {
  const payload = pickForSchema(AnalyticsEvents.REPORT_CONTENT, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.REPORT_CONTENT, payload);
}

export function trackSessionStart(p = {}) {
  const payload = pickForSchema(AnalyticsEvents.SESSION_START, p) || {};
  return track(AnalyticsEvents.SESSION_START, payload);
}

export function trackOnboardingStepComplete(p) {
  const payload = pickForSchema(AnalyticsEvents.ONBOARDING_STEP_COMPLETE, p);
  if (!payload) return Promise.resolve();
  return track(AnalyticsEvents.ONBOARDING_STEP_COMPLETE, payload);
}

export function trackOnboardingDone(p = {}) {
  const payload = pickForSchema(AnalyticsEvents.ONBOARDING_DONE, p) || {};
  return track(AnalyticsEvents.ONBOARDING_DONE, payload);
}

// JSDoc: Event semantics and when to fire
/**
 * Event semantics (MVP):
 * - card_impression: Fire when an event card is >=50% visible for >=750ms in a scroll surface.
 *   payload: { card_type, card_id, position?, surface?, feed_type?, experiment?, variant? }
 * - card_click: Fire when a card is tapped/clicked.
 *   payload: { card_type, card_id, position?, surface?, feed_type?, experiment?, variant? }
 * - open_event: Fire when event detail is opened (from any surface).
 *   payload: { event_id, source?, surface?, origin_event_id? }
 * - save_event: Fire when user toggles save/bookmark on an event (future).
 *   payload: { event_id, source?, surface?, saved? }
 * - share_event: Fire when user shares an event.
 *   payload: { event_id, channel, source?, surface? }
 * - rsvp_yes: Fire on affirmative RSVP intent (before backend result is OK is acceptable, but prefer post-success).
 *   payload: { event_id, capacity?, attendee_count?, was_waitlisted?, surface?, source? }
 * - rsvp_no: Fire when user declines.
 *   payload: { event_id, reason?, surface?, source? }
 * - join_event: Fire once the user is actually added to attendees (success path). If waitlisted, set was_waitlisted=true.
 *   payload: { event_id, method?, was_waitlisted?, surface?, source? }
 * - check_in: Fire when attendee checks in at event (future).
 *   payload: { event_id, method?, distance_m?, surface? }
 * - report_content: Fire when a user submits a report.
 *   payload: { content_type, content_id, reason_category, event_id?, severity?, surface? }
 */

export default { track };
