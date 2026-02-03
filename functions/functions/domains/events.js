// Event-related domain functions (placeholder for future full extraction)
const { onCall } = require('firebase-functions/v2/https');
const { JOIN_CALLABLE_OPTIONS } = require('../shared/config');

// Placeholder to keep exports wired; actual logic remains in index.js until migrated
const noopEventCallable = onCall(JOIN_CALLABLE_OPTIONS, async () => {
  return { ok: true, message: 'not yet migrated' };
});

module.exports = {
  noopEventCallable,
};

