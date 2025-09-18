// Description: Minimal error reporting facade - temporarily disabled during troubleshooting
let S = null; // module ref
let initialized = false;

function loadSentry() {
  // Temporarily disabled - returning null to prevent module resolution issues
  return null;
}

export function initErrorReporting(options = {}) {
  try {
    if (!options?.dsn) return; // treat empty DSN as disabled (test expectation)
    const mod = loadSentry();
    if (!mod) return;
    const initFn = mod.init || mod.default?.init;
    if (typeof initFn === 'function') {
      initFn(options);
      initialized = true;
    }
  } catch {
    // swallow
  }
}

export function setUserInErrorReporting(user) {
  try {
    const mod = loadSentry();
    if (!mod) return;
    const setUser = mod.setUser || mod.default?.setUser;
    if (typeof setUser === 'function') {
      if (user?.uid) setUser({ id: user.uid });
      else setUser(null);
    }
  } catch {}
}

export function captureError(err, context) {
  try {
    const mod = loadSentry();
    if (!mod) return; // silent no-op
    const captureException =
      mod.captureException ||
      mod.Native?.captureException ||
      mod.default?.captureException;
    if (typeof captureException === 'function') {
      captureException(err, context);
    }
  } catch {
    // ignore
  }
}

// For test visibility
export function __isErrorReportingInitialized() {
  return initialized;
}
