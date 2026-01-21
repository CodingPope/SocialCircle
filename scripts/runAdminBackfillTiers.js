// Description: Run adminBackfillTiers through the local Functions emulator.

const DEFAULT_PROJECT = 'social-scene1';

function parseBool(value, fallback) {
  if (value == null) return fallback;
  return String(value).toLowerCase() === 'true';
}

async function getEmulatorInfo(hubHost) {
  const res = await fetch(`http://${hubHost}/emulators`);
  if (!res.ok) {
    throw new Error(`Emulator hub error: ${res.status}`);
  }
  return res.json();
}

async function main() {
  const hubHost = process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400';
  const firebaseConfig = process.env.FIREBASE_CONFIG
    ? JSON.parse(process.env.FIREBASE_CONFIG)
    : {};
  const projectId =
    process.env.GCLOUD_PROJECT ||
    firebaseConfig.projectId ||
    DEFAULT_PROJECT;

  const payload = {
    scope: process.env.BACKFILL_SCOPE || 'users',
    dryRun: parseBool(process.env.BACKFILL_DRY_RUN, false),
    syncClaims: parseBool(process.env.BACKFILL_SYNC_CLAIMS, true),
  };

  if (process.env.BACKFILL_FORCE_USER_TIER) {
    payload.forceUserTier = process.env.BACKFILL_FORCE_USER_TIER;
  }
  if (process.env.BACKFILL_FORCE_BUSINESS_TIER) {
    payload.forceBusinessTier = process.env.BACKFILL_FORCE_BUSINESS_TIER;
  }
  if (process.env.BACKFILL_NORMALIZE_USER_FLAGS) {
    payload.normalizeUserFlags = parseBool(
      process.env.BACKFILL_NORMALIZE_USER_FLAGS,
      false
    );
  }

  const info = await getEmulatorInfo(hubHost);
  const functionsInfo = info?.emulators?.functions || {};
  const functionsHost = functionsInfo.host || '127.0.0.1';
  const functionsPort = functionsInfo.port || 5001;

  const url = `http://${functionsHost}:${functionsPort}/${projectId}/us-central1/adminBackfillTiers`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Backfill failed (${res.status}): ${text}`);
  }

  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
