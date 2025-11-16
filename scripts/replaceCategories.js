#!/usr/bin/env node

const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

typeCheckPayload();

const dataPath = path.resolve(
  __dirname,
  '../src/features/events/constants/categoriesData.json'
);
const catalog = require(dataPath);

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.PROJECT_ID ||
  null;

if (!projectId) {
  console.error(
    '[categories] Missing project id. Set FIREBASE_PROJECT_ID (or GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT).'
  );
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();

(async function replaceCategories() {
  const categoriesRef = db.collection('categories');

  console.log('[categories] clearing existing documents...');
  const existing = await categoriesRef.listDocuments();
  for (let i = 0; i < existing.length; i += 400) {
    const chunk = existing.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach((docRef) => batch.delete(docRef));
    await batch.commit();
  }

  console.log('[categories] seeding new catalog...');
  let batch = db.batch();
  let writes = 0;

  for (const category of catalog) {
    const docRef = categoriesRef.doc(category.id);
    batch.set(docRef, normalizeCategory(category));
    writes += 1;
    if (writes % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  if (writes % 400 !== 0) {
    await batch.commit();
  }

  console.log(`[categories] loaded ${writes} categories`);
  process.exit(0);
})().catch((err) => {
  console.error('[categories] failed to replace catalog');
  console.error(err);
  process.exit(1);
});

function normalizeCategory(category) {
  const interests = Array.isArray(category?.interests)
    ? category.interests
    : [];
  return {
    name: sanitizeString(category?.name),
    emoji: sanitizeString(category?.emoji || ''),
    interests: interests.map((interest) => ({
      name: sanitizeString(interest?.name),
      count_selected: toNumber(interest?.count_selected),
      count_event_matches: toNumber(interest?.count_event_matches),
      count_event_views: toNumber(interest?.count_event_views),
      count_event_joins: toNumber(interest?.count_event_joins),
      last_activity: sanitizeNullableString(interest?.last_activity),
    })),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function sanitizeString(value) {
  if (value == null) return '';
  const str = String(value).trim();
  return str;
}

function sanitizeNullableString(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str || null;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function typeCheckPayload() {
  try {
    const payloadPath = path.resolve(__dirname, 'categories.json');
    const payload = require(payloadPath);
    if (!Array.isArray(payload)) {
      throw new Error('categories.json must export an array');
    }
    payload.forEach((category) => {
      if (!category?.id) {
        throw new Error('Each category must include an id');
      }
    });
  } catch (err) {
    console.error('[categories] invalid categories.json payload');
    throw err;
  }
}
