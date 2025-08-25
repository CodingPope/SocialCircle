// Minimal error reporting wrapper (Sentry-compatible API surface)
let S = null;
function isExpoGo() {
  try {
    const Constants = require('expo-constants').default;
    return Constants?.appOwnership === 'expo';
  } catch {
    return false;
  }
}
try {
  if (!isExpoGo()) {
    S = require('@sentry/react-native');
  }
} catch {
  S = null;
}

export function initErrorReporting(options = {}) {
  try {
    if (!S || !S.default || typeof S.default.init !== 'function') return;
    S.default.init(options);
  } catch {}
}

export function setUserInErrorReporting(user) {
  try {
    if (!S || !S.default || typeof S.default.setUser !== 'function') return;
    if (user && user.uid) S.default.setUser({ id: user.uid });
    else S.default.setUser(null);
  } catch {}
}
