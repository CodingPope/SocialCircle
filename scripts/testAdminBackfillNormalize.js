// Smoke test: seed a user, run adminBackfillTiers with normalizeUserFlags + forceUserTier=popular
// and assert that isPopular is written to the user doc.

const DEFAULT_PROJECT = 'social-scene1';
const admin = require('firebase-admin');

async function getEmulatorInfo(hubHost) {
  const res = await fetch(`http://${hubHost}/emulators`);
  if (!res.ok) throw new Error(`Emulator hub error: ${res.status}`);
  return res.json();
}

async function main() {
  const hubHost = process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400';
  const firebaseConfig = process.env.FIREBASE_CONFIG
    ? JSON.parse(process.env.FIREBASE_CONFIG)
    : {};
  const projectId =
    process.env.GCLOUD_PROJECT || firebaseConfig.projectId || DEFAULT_PROJECT;

  // initialize admin (emulator env will route firestore calls to emulator)
  admin.initializeApp();
  const db = admin.firestore();

  // prepare test user doc
  const userId = `test-popular-${Date.now()}`;
  const userRef = db.doc(`users/${userId}`);
  await userRef.set({
    displayName: 'Backfill Test User',
    accountTier: 'basic',
  });
  console.log('[test] seeded user', userId);

  const info = await getEmulatorInfo(hubHost);
  const functionsInfo = info?.emulators?.functions || {};
  const functionsHost = functionsInfo.host || '127.0.0.1';
  const functionsPort = functionsInfo.port || 5001;

  const url = `http://${functionsHost}:${functionsPort}/${projectId}/us-central1/adminBackfillTiers`;

  const payload = {
    scope: 'users',
    normalizeUserFlags: true,
    forceUserTier: 'popular',
    dryRun: false,
    syncClaims: false,
  };

  console.log('[test] calling backfill', url, payload);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Backfill call failed (${res.status}): ${text}`);
  console.log('[test] backfill response:', text);

  const after = (await userRef.get()).data();
  console.log('[test] user after:', after);

  if (after.isPopular !== true) {
    console.error('[test] FAIL — isPopular was not set to true');
    process.exit(2);
  }

  console.log('[test] PASS — isPopular set to true');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
