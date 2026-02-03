const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { BUSINESS_ENFORCE_APPCHECK, BUSINESS_CALLABLE_OPTIONS, JOIN_CALLABLE_OPTIONS } = (() => {
  const cfg = require('../shared/config');
  // Derive business callable options from shared config; fall back to JOIN options with app check toggle
  const opts = {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 120,
    enforceAppCheck: cfg.BUSINESS_ENFORCE_APPCHECK,
  };
  return {
    BUSINESS_ENFORCE_APPCHECK: cfg.BUSINESS_ENFORCE_APPCHECK,
    BUSINESS_CALLABLE_OPTIONS: opts,
    JOIN_CALLABLE_OPTIONS: cfg.JOIN_CALLABLE_OPTIONS,
  };
})();

const db = admin.firestore();

function assertAuth(req) {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required');
  return uid;
}

function hasRole(biz, uid, roles) {
  const members = Array.isArray(biz?.members) ? biz.members : [];
  return members.some(
    (m) => m && m.uid === uid && roles.includes((m.role || '').toLowerCase()),
  );
}

async function getBusinessIfMember(bizId, uid) {
  const ref = db.collection('businesses').doc(bizId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Business not found');
  const biz = snap.data();
  if (!hasRole(biz, uid, ['owner', 'manager', 'staff']))
    throw new HttpsError('permission-denied', 'Not a member');
  return { ref, biz };
}

// createBusinessDraft
const createBusinessDraft = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { type = 'single' } = req.data || {};
  const ref = await db.collection('businesses').add({
    ownerId: uid,
    status: 'draft',
    type,
    members: [{ uid, role: 'Owner' }],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, bizId: ref.id };
});

// updateBusinessBasics
const updateBusinessBasics = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, name, description, category } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const { ref } = await getBusinessIfMember(bizId, uid);
  await ref.set(
    {
      name: name ? String(name).slice(0, 80) : null,
      description: description ? String(description).slice(0, 400) : null,
      category: category ? String(category).slice(0, 80) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true };
});

// updateBrandAssets
const updateBrandAssets = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, logoUrl, heroUrl } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const { ref } = await getBusinessIfMember(bizId, uid);
  await ref.set(
    {
      logoUrl: logoUrl || null,
      heroUrl: heroUrl || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true };
});

// addBusinessLocation
const addBusinessLocation = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const {
    bizId,
    label,
    address,
    city,
    state,
    country,
    latitude,
    longitude,
    hours,
    serviceRadiusKm,
    locId,
  } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  if (typeof latitude !== 'number' || typeof longitude !== 'number')
    throw new HttpsError('invalid-argument', 'latitude/longitude required');

  const { biz } = await getBusinessIfMember(bizId, uid);
  if (!hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');

  const gh = require('geofire-common').geohashForLocation([
    latitude,
    longitude,
  ]);
  const geohash5 = typeof gh === 'string' ? gh.substring(0, 5) : null;
  const geohash7 = typeof gh === 'string' ? gh.substring(0, 7) : null;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const locationRef = db
    .collection('businesses')
    .doc(bizId)
    .collection('locations')
    .doc(locId ? String(locId) : undefined);

  const data = {
    label: String(label || '').slice(0, 60) || null,
    address: String(address || '').slice(0, 200) || null,
    city: String(city || '').slice(0, 60) || null,
    state: String(state || '').slice(0, 60) || null,
    country: String(country || '').slice(0, 60) || null,
    latitude,
    longitude,
    geohash5,
    geohash7,
    hours: hours && typeof hours === 'object' ? hours : null,
    serviceRadiusKm:
      typeof serviceRadiusKm === 'number' ? serviceRadiusKm : null,
    updatedAt: now,
  };

  if (!locId) data.createdAt = now;

  await locationRef.set(data, { merge: Boolean(locId) });
  logger.log('[business] location saved', bizId, locationRef.id);
  return { ok: true, locId: locationRef.id };
});

// updateAudiencePolicies
const updateAudiencePolicies = onCall(
  BUSINESS_CALLABLE_OPTIONS,
  async (req) => {
    const uid = assertAuth(req);
    const { bizId, ageRestriction, genderRestriction, interests, houseRules } =
      req.data || {};
    if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
    const { ref, biz } = await getBusinessIfMember(bizId, uid);
    if (!hasRole(biz, uid, ['owner', 'manager']))
      throw new HttpsError('permission-denied', 'Owner/Manager only');
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    const age = String(ageRestriction || 'none').toLowerCase();
    const gender = String(genderRestriction || 'none').toLowerCase();
    updates.ageRestriction = ['none', '18+', '21+'].includes(age)
      ? age
      : 'none';
    updates.genderRestriction = [
      'none',
      'women_only',
      'men_only',
      'other',
    ].includes(gender)
      ? gender
      : 'none';
    updates.interests = Array.isArray(interests)
      ? interests.map((i) => String(i).slice(0, 40)).slice(0, 20)
      : [];
    updates.houseRules = houseRules ? String(houseRules).slice(0, 500) : null;
    await ref.set(updates, { merge: true });
    return { ok: true };
  },
);

// startBusinessVerification
const startBusinessVerification = onCall(
  BUSINESS_CALLABLE_OPTIONS,
  async (req) => {
    const uid = assertAuth(req);
    const { bizId, method } = req.data || {};
    if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
    const m = String(method || '').toLowerCase();
    if (!['domain_email', 'sms'].includes(m))
      throw new HttpsError('invalid-argument', 'Invalid method');
    const { ref, biz } = await getBusinessIfMember(bizId, uid);
    if (!hasRole(biz, uid, ['owner', 'manager']))
      throw new HttpsError('permission-denied', 'Owner/Manager only');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeRef = ref.collection('verificationCodes').doc();
    await codeRef.set({
      method: m,
      code,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: uid,
      consumed: false,
    });
    await ref.set(
      { verification: { status: 'pending', method: m, verifiedAt: null } },
      { merge: true },
    );
    logger.log('[business] verification started', bizId, m);
    return { ok: true, devCode: code };
  },
);

// verifyBusinessCode
const verifyBusinessCode = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, code } = req.data || {};
  if (!bizId || !code)
    throw new HttpsError('invalid-argument', 'Missing params');
  const { ref, biz } = await getBusinessIfMember(bizId, uid);
  if (!hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');

  const codesSnap = await ref
    .collection('verificationCodes')
    .where('consumed', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  let matched = null;
  for (const d of codesSnap.docs) {
    const c = d.get('code');
    if (String(c) === String(code)) {
      matched = d.ref;
      break;
    }
  }
  if (!matched) throw new HttpsError('permission-denied', 'Invalid code');
  const now = admin.firestore.FieldValue.serverTimestamp();
  await matched.set({ consumed: true, consumedAt: now }, { merge: true });
  await ref.set(
    { verification: { status: 'verified', verifiedAt: now } },
    { merge: true },
  );
  logger.log('[business] verified', bizId);
  return { ok: true };
});

// addBusinessMember
const addBusinessMember = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, targetUid, email, role } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const r = String(role || '').toLowerCase();
  if (!['owner', 'manager', 'staff'].includes(r))
    throw new HttpsError('invalid-argument', 'Invalid role');

  const { ref, biz } = await getBusinessIfMember(bizId, uid);
  if (r === 'owner' && !hasRole(biz, uid, ['owner']))
    throw new HttpsError('permission-denied', 'Only Owner can assign Owner');
  if (r !== 'owner' && !hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');

  let target = targetUid || null;
  if (!target && email) {
    const q = await db
      .collection('users')
      .where('email', '==', String(email))
      .limit(1)
      .get();
    if (!q.empty) target = q.docs[0].id;
  }
  if (!target) throw new HttpsError('not-found', 'Target user not found');

  await ref.set(
    {
      members: admin.firestore.FieldValue.arrayUnion({
        uid: target,
        role: role.charAt(0).toUpperCase() + r.slice(1),
      }),
    },
    { merge: true },
  );
  await mirrorMembership(
    target,
    bizId,
    role.charAt(0).toUpperCase() + r.slice(1),
  );
  logger.log('[business] member added', bizId, target, role);
  return { ok: true };
});

async function mirrorMembership(uid, bizId, role) {
  const userRef = db.doc(`users/${uid}`);
  await userRef.set(
    {
      businessMemberships: admin.firestore.FieldValue.arrayUnion({
        bizId,
        role,
      }),
    },
    { merge: true },
  );
}

// setBusinessPrivacy
const setBusinessPrivacy = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, analyticsShare } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const { ref, biz } = await getBusinessIfMember(bizId, uid);
  if (!hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');
  await ref.set(
    {
      privacy: { analyticsShare: analyticsShare !== false },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true };
});

// submitBusiness
const submitBusiness = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, review } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const { ref, biz } = await getBusinessIfMember(bizId, uid);
  if (!hasRole(biz, uid, ['owner', 'manager']))
    throw new HttpsError('permission-denied', 'Owner/Manager only');
  const status = review === true ? 'pending_review' : 'active';
  await ref.set(
    { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true };
});

// createOrUpdateBusiness (simplified onboarding)
const createOrUpdateBusiness = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const { bizId, ...payload } = req.data || {};
  const targetRef = bizId
    ? db.collection('businesses').doc(bizId)
    : db.collection('businesses').doc();
  if (bizId) {
    const snap = await targetRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Business missing');
    const biz = snap.data();
    if (!hasRole(biz, uid, ['owner', 'manager']))
      throw new HttpsError('permission-denied', 'Not authorized');
  }
  await targetRef.set(
    {
      ...payload,
      ownerId: payload.ownerId || uid,
      members: payload.members || [{ uid, role: 'Owner' }],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true, bizId: targetRef.id };
});

// switchToPersonalAccount (stub)
const switchToPersonalAccount = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  await db.doc(`users/${uid}`).set({ accountType: 'personal' }, { merge: true });
  return { ok: true };
});

module.exports = {
  createBusinessDraft,
  updateBusinessBasics,
  updateBrandAssets,
  addBusinessLocation,
  updateAudiencePolicies,
  startBusinessVerification,
  verifyBusinessCode,
  addBusinessMember,
  setBusinessPrivacy,
  submitBusiness,
  createOrUpdateBusiness,
  switchToPersonalAccount,
};

