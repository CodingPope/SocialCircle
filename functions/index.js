// At top of functions/index.js
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
admin.initializeApp();

exports.getEvents = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    cpu: 1,
    timeoutSeconds: 60,
  },
  async (req) => {
    logger.log('🔥 getEvents called; auth=', req.auth?.uid ?? 'none');
    const snap = await admin.firestore().collection('events').get();
    return { events: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }
);
