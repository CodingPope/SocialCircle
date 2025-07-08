/* eslint-disable comma-dangle */
/* eslint-disable object-curly-spacing */
/* eslint-disable indent */
/* eslint-disable quotes */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.getEvents = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // get UID safely
    const uid = context.auth && context.auth.uid ? context.auth.uid : 'none';
    console.log('🔥 getEvents called; auth =', uid);

    try {
      // read your events collection
      const snap = await admin.firestore().collection('events').get();
      const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log(`✅ fetched ${events.length} events`);
      return { events };
    } catch (err) {
      // print full stack
      console.error('❌ getEvents error:', err);
      // bubble up a proper HttpsError
      throw new functions.https.HttpsError(
        'internal',
        'Failed to fetch events',
        /* optional error details */ err.toString()
      );
    }
  });
