// Description: Sentry initialization and global error capture for Expo managed workflow.
// Usage: import { initErrorReporting } from './lib/errorReporting'; initErrorReporting({ dsn, environment, release })

import * as Sentry from 'sentry-expo';
import { Platform } from 'react-native';

let initialized = false; // ensures init runs once per session
let configured = false; // true only when Sentry.init succeeds (DSN provided)
let defaultHandler = null;

export function initErrorReporting({
  dsn,
  tracesSampleRate = 0.1,
  debug = false,
  environment = undefined,
  release = undefined,
} = {}) {
  try {
    if (initialized) return;
    if (!dsn || typeof dsn !== 'string' || dsn.trim().length === 0) {
      // No-op init to avoid crashes when DSN not provided
      initialized = true;
      configured = false;
      return;
    }

    Sentry.init({
      dsn,
      enableInExpoDevelopment: true,
      debug: !!debug,
      tracesSampleRate,
      environment,
      release,
    });
    configured = true;

    // Capture global JS errors
    if (
      global.ErrorUtils &&
      typeof global.ErrorUtils.getGlobalHandler === 'function'
    ) {
      defaultHandler =
        global.ErrorUtils.getGlobalHandler &&
        global.ErrorUtils.getGlobalHandler();
      global.ErrorUtils.setGlobalHandler((error, isFatal) => {
        try {
          if (configured) {
            Sentry.Native.captureException(error, {
              level: 'error',
              tags: { isFatal: String(!!isFatal) },
            });
          }
        } catch {}
        if (defaultHandler) {
          try {
            defaultHandler(error, isFatal);
          } catch {}
        }
      });
    }

    // Capture unhandled promise rejections (best-effort)
    const rejectionHandler = (event) => {
      const reason = event?.reason || event;
      try {
        if (configured) {
          Sentry.Native.captureException(reason);
        }
      } catch {}
    };
    if (typeof global.addEventListener === 'function') {
      try {
        global.addEventListener('unhandledrejection', rejectionHandler);
      } catch {}
    }

    initialized = true;
  } catch (e) {
    // Never throw from init
    initialized = true;
    configured = false;
  }
}

export function captureError(err, context = {}) {
  try {
    if (!configured) return;
    Sentry.Native.captureException(err, { extra: context });
  } catch {}
}

export function captureMessage(msg, level = 'info', context = {}) {
  try {
    if (!configured) return;
    Sentry.Native.captureMessage(String(msg), { level, extra: context });
  } catch {}
}
