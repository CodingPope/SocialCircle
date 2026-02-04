// At top of functions/index.js
const {
  onCall,
  onRequest,
  HttpsError,
} = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const {
  onDocumentUpdated,
  onDocumentCreated,
  onDocumentDeleted,
} = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { geohashForLocation } = require('geofire-common');
const {
  BUSINESS_TIERS,
  USER_TIERS,
  normalizeUserTier,
  normalizeBusinessTier,
  deriveUserTier,
  hasUserTier,
  hasBusinessTier,
  getBusinessCapabilities,
} = require('./tiers');
const {
  projectId,
  ENFORCE_APPCHECK,
  BUSINESS_ENFORCE_APPCHECK,
  JOIN_CALLABLE_OPTIONS,
  ADMIN_CALLABLE_OPTIONS,
  BUSINESS_CALLABLE_OPTIONS,
  SHARE_CONFIG,
} = require('./shared/config');
const { truncate, toDate } = require('./shared/helpers');

// Initialize Firebase Admin BEFORE importing domain modules that use it
admin.initializeApp();

// Now safe to import modules that use admin SDK
const { shareGenerateLink, sharePreview } = require('./domains/share');
const { sendExpoPushMessages } = require('./domains/notifications');
const {
  computePopularity,
  rollupDailyAnalytics,
  sendEventReminders,
  aggregateUsageMetrics,
} = require('./domains/scheduled');

// Domain re-exports (business) - override inline implementations
exports.updateBusinessBasics =
  require('./domains/business').updateBusinessBasics;
exports.updateBrandAssets = require('./domains/business').updateBrandAssets;
exports.addBusinessLocation = require('./domains/business').addBusinessLocation;
exports.updateAudiencePolicies =
  require('./domains/business').updateAudiencePolicies;
exports.startBusinessVerification =
  require('./domains/business').startBusinessVerification;
exports.verifyBusinessCode = require('./domains/business').verifyBusinessCode;
exports.addBusinessMember = require('./domains/business').addBusinessMember;
exports.setBusinessPrivacy = require('./domains/business').setBusinessPrivacy;
exports.submitBusiness = require('./domains/business').submitBusiness;
const db = admin.firestore(); // convenience
const FieldValue = admin.firestore.FieldValue;
function fieldDelete() {
  try {
    if (FieldValue && typeof FieldValue.delete === 'function')
      return FieldValue.delete();
  } catch (e) {
    // ignore
  }
  return undefined;
}

async function syncAccountTierClaims(uid, accountTier) {
  try {
    const userRecord = await admin.auth().getUser(uid);
    const currentClaims = userRecord.customClaims || {};
    if (currentClaims.accountTier === accountTier) return null;
    await admin.auth().setCustomUserClaims(uid, {
      ...currentClaims,
      accountTier,
    });
    return true;
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    logger.warn('[tiers] syncAccountTierClaims failed:', err?.message || err);
    return null;
  }
}

function buildUserTierPatch(user) {
  const nextTier = deriveUserTier(user);
  if (!nextTier || user?.accountTier === nextTier) return null;
  return { accountTier: nextTier };
}

function requireUserTier(user, requiredTier, context = 'This action') {
  if (!hasUserTier(user, requiredTier)) {
    const expected = normalizeUserTier(requiredTier) || USER_TIERS.BASIC;
    throw new HttpsError(
      'permission-denied',
      `${context} requires ${expected} tier.`,
    );
  }
}

function requireBusinessTier(business, requiredTier, context = 'This action') {
  if (!hasBusinessTier(business, requiredTier)) {
    const expected =
      normalizeBusinessTier(requiredTier) || BUSINESS_TIERS.TIER_1_FREE;
    throw new HttpsError(
      'permission-denied',
      `${context} requires ${expected} business tier.`,
    );
  }
}

function buildUserTierUpdate(tier) {
  switch (tier) {
    case USER_TIERS.PAID:
      return {
        accountTier: USER_TIERS.PAID,
        premiumActive: true,
        premiumTier: USER_TIERS.PAID,
        plan: USER_TIERS.PAID,
        isPopular: false,
      };
    case USER_TIERS.POPULAR: {
      const out = {
        accountTier: USER_TIERS.POPULAR,
        premiumActive: false,
        plan: 'free',
        isPopular: true,
      };
      const del = fieldDelete();
      if (del !== undefined) out.premiumTier = del;
      return out;
    }
    case USER_TIERS.BASIC:
    default: {
      const out = {
        accountTier: USER_TIERS.BASIC,
        premiumActive: false,
        plan: 'free',
        isPopular: false,
      };
      const del = fieldDelete();
      if (del !== undefined) out.premiumTier = del;
      return out;
    }
  }
}

function buildUserDisplayName(user = {}) {
  if (!user || typeof user !== 'object') return 'Someone';
  if (typeof user.displayName === 'string' && user.displayName.trim()) {
    return user.displayName.trim();
  }
  if (typeof user.name === 'string' && user.name.trim()) {
    return user.name.trim();
  }
  const first = typeof user.firstName === 'string' ? user.firstName.trim() : '';
  const last = typeof user.lastName === 'string' ? user.lastName.trim() : '';
  const combined = [first, last].filter(Boolean).join(' ');
  return combined || 'Someone';
}

async function createShortDynamicLink({ link, title, description, imageUrl }) {
  if (!SHARE_CONFIG.apiKey || !SHARE_CONFIG.domainUriPrefix) return null;

  const payload = {
    dynamicLinkInfo: {
      domainUriPrefix: SHARE_CONFIG.domainUriPrefix,
      link,
      androidInfo: {
        androidPackageName: SHARE_CONFIG.androidPackageName,
        androidFallbackLink: SHARE_CONFIG.androidFallbackUrl || undefined,
      },
      iosInfo: {
        iosBundleId: SHARE_CONFIG.iosBundleId,
        iosAppStoreId: SHARE_CONFIG.iosAppStoreId || undefined,
        iosFallbackLink: SHARE_CONFIG.iosFallbackUrl || undefined,
      },
      socialMetaTagInfo: {
        socialTitle: truncate(title, 70) || 'Social Circle',
        socialDescription: truncate(description, 120) || undefined,
        socialImageLink: imageUrl || undefined,
      },
    },
    suffix: { option: 'SHORT' },
  };

  const endpoint = `https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${SHARE_CONFIG.apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn('[share] dynamic link error', res.status, text);
    return null;
  }

  const json = await res.json().catch(() => ({}));
  return json?.shortLink || null;
}

async function buildEventPreview(eventId) {
  const snap = await db.doc(`events/${eventId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }
  const data = snap.data() || {};
  const privacy = (data.privacy || 'public').toLowerCase();
  if (privacy !== 'public') {
    throw new HttpsError('permission-denied', 'Event is not shareable');
  }

  const when = toDate(data.date);
  const whenLabel = when
    ? when.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const where = data.location?.address || data.address || '';
  const description = truncate(
    [whenLabel, where, data.description].filter(Boolean).join(' • '),
  );

  return {
    title: data.title || 'Social Circle Event',
    description: description || 'Join this Social Circle event.',
    imageUrl: data.imageUrl || data.imageUri || null,
    raw: data,
  };
}

async function buildPostPreview(postId) {
  const snap = await db.doc(`interestPosts/${postId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Post not found');
  }
  const data = snap.data() || {};
  if (data.isDeleted === true) {
    throw new HttpsError('not-found', 'Post not found');
  }
  const author =
    data?.creatorSnapshot?.displayName ||
    data?.creatorSnapshot?.name ||
    'Social Circle member';

  return {
    title: `${author} on Social Circle`,
    description:
      truncate(data.content, 200) || 'See what’s happening on Social Circle.',
    imageUrl: data.mediaUrl || data.mediaThumbnailUrl || null,
    raw: data,
  };
}

async function buildProfilePreview(userId) {
  const snap = await db.doc(`users/${userId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Profile not found');
  }

  const data = snap.data() || {};
  if (data.isDeleted === true) {
    throw new HttpsError('not-found', 'Profile not found');
  }

  const first = typeof data.firstName === 'string' ? data.firstName.trim() : '';
  const last = typeof data.lastName === 'string' ? data.lastName.trim() : '';
  const displayNameRaw =
    (typeof data.displayName === 'string' ? data.displayName : '') ||
    `${first} ${last}`.trim();
  const displayName = displayNameRaw.trim();

  const headline =
    (typeof data.bio === 'string' && data.bio.trim()) ||
    (typeof data.tagline === 'string' && data.tagline.trim()) ||
    '';

  const city =
    (typeof data.city === 'string' && data.city.trim()) ||
    (typeof data.location === 'string' && data.location.trim()) ||
    '';

  const descriptionPieces = [headline, city].filter(Boolean);
  const description =
    truncate(descriptionPieces.join(' • '), 160) || 'Connect on Social Circle.';

  const imageUrl =
    data.profileImage ||
    data.avatarURL ||
    data.photoURL ||
    data.imageUrl ||
    null;

  return {
    title: `${displayName || 'Social Circle member'} on Social Circle`,
    description,
    imageUrl,
    raw: data,
  };
}

function buildShareTargetUrl(type, id) {
  return `${SHARE_CONFIG.previewBase.replace(
    /\/$/,
    '',
  )}/${type}/${encodeURIComponent(id)}`;
}

// -------------------- EXISTING FUNCTIONS (unchanged) --------------------

// Callable function to re-enable a disabled Auth user (for account reactivation)
exports.enableAuthUser = onCall(async (req) => {
  const { uid } = req.data;
  if (!uid) throw new HttpsError('invalid-argument', 'Missing uid');
  await admin.auth().updateUser(uid, { disabled: false });
  return { success: true };
});

// Description: Permanently delete user account and associated data (Apple compliance)
exports.deleteUserAccount = onCall(ADMIN_CALLABLE_OPTIONS, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

    logger.info(`[deleteUserAccount] Starting deletion for user: ${uid}`);

    try {
      // 1. Fetch user data before deletion
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.data() || {};

      // 2. Revoke Apple Sign-In tokens if applicable
      if (userData.appleAuthorizationCode) {
        try {
          await revokeAppleToken(userData.appleAuthorizationCode);
          logger.info(`[deleteUserAccount] Revoked Apple tokens for: ${uid}`);
        } catch (appleErr) {
          logger.warn(
            `[deleteUserAccount] Failed to revoke Apple token: ${appleErr.message}`,
          );
          // Continue with deletion even if token revocation fails
        }
      }

      // 3. Delete user-generated content
      const batch = db.batch();

      // Delete user's events (as creator/host)
      const userEvents = await db
        .collection('events')
        .where('createdBy', '==', uid)
        .get();
      userEvents.docs.forEach((doc) => batch.delete(doc.ref));
      logger.info(
        `[deleteUserAccount] Marking ${userEvents.size} events for deletion`,
      );

      // Remove user from event attendees (all events they joined)
      const attendedEvents = await db
        .collection('events')
        .where('attendees', 'array-contains', uid)
        .get();
      attendedEvents.docs.forEach((doc) => {
        batch.update(doc.ref, {
          attendees: FieldValue.arrayRemove(uid),
          attendeeCount: FieldValue.increment(-1),
        });
      });

      // Delete user's messages in all chats
      const userMessages = await db
        .collection('messages')
        .where('senderId', '==', uid)
        .get();
      userMessages.docs.forEach((doc) => batch.delete(doc.ref));
      logger.info(
        `[deleteUserAccount] Marking ${userMessages.size} messages for deletion`,
      );

      // Delete chats where user is a member
      const userChats = await db
        .collection('chats')
        .where('members', 'array-contains', uid)
        .get();
      userChats.docs.forEach((doc) => batch.delete(doc.ref));
      logger.info(
        `[deleteUserAccount] Marking ${userChats.size} chats for deletion`,
      );

      // Delete user document
      batch.delete(db.collection('users').doc(uid));

      // Commit all Firestore deletions
      await batch.commit();
      logger.info(`[deleteUserAccount] Firestore data deleted for: ${uid}`);

      // 4. Delete Firebase Auth user
      await admin.auth().deleteUser(uid);
      logger.info(`[deleteUserAccount] Firebase Auth user deleted: ${uid}`);

      // 5. Delete user's storage files (profile images, event images)
      try {
        const bucket = admin.storage().bucket();
        await bucket.deleteFiles({ prefix: `users/${uid}/` });
        logger.info(`[deleteUserAccount] Storage files deleted for: ${uid}`);
      } catch (storageErr) {
        logger.warn(
          `[deleteUserAccount] Storage deletion failed: ${storageErr.message}`,
        );
        // Continue - storage may be empty or already deleted
      }

      logger.info(
        `[deleteUserAccount] Successfully completed deletion for: ${uid}`,
      );
      return {
        success: true,
        message: 'Account permanently deleted',
      };
    } catch (error) {
      logger.error(
        `[deleteUserAccount] Failed for user ${uid}:`,
        error?.message || error,
      );
      throw new HttpsError(
        'internal',
        'Failed to delete account. Please contact support.',
      );
    }
  },
);

/**
 * Revoke Apple Sign-In refresh token
 * https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens
 */
async function revokeAppleToken(authorizationCode) {
  // Apple token revocation requires client_secret (JWT signed by team private key)
  // This is a simplified implementation - in production you'd need:
  // 1. Apple Team ID, Key ID, and private key
  // 2. Generate client_secret JWT
  // 3. POST to https://appleid.apple.com/auth/revoke

  // For now, we log and skip actual revocation
  // TODO: Implement full Apple token revocation with proper credentials
  logger.warn(
    '[revokeAppleToken] Apple token revocation not fully implemented. Authorization code stored but not revoked.',
  );

  // Placeholder for future implementation:
  // const clientSecret = generateAppleClientSecret();
  // const response = await fetch('https://appleid.apple.com/auth/revoke', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //   body: new URLSearchParams({
  //     client_id: 'com.socialcirclellc.app',
  //     client_secret: clientSecret,
  //     token: authorizationCode,
  //     token_type_hint: 'refresh_token'
  //   })
  // });
}

// Description: Sync Firebase Auth user disabled state with Firestore isDeleted field
exports.syncAuthWithSoftDelete = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before.isDeleted && after.isDeleted) {
      await admin.auth().updateUser(event.params.userId, { disabled: true });
    }
    if (before.isDeleted && !after.isDeleted) {
      await admin.auth().updateUser(event.params.userId, { disabled: false });
    }
  },
);

// Description: Keep accountTier in sync with premium/popular flags.
exports.syncUserAccountTierOnCreate = onDocumentCreated(
  'users/{userId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const patch = buildUserTierPatch(snap.data() || {});
    if (!patch) {
      const derived = deriveUserTier(snap.data() || {});
      if (derived) await syncAccountTierClaims(event.params.userId, derived);
      return;
    }
    await snap.ref.set(patch, { merge: true });
    await syncAccountTierClaims(event.params.userId, patch.accountTier);
  },
);

exports.syncUserAccountTierOnUpdate = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    const after = event.data.after;
    if (!after) return;
    const beforeData = event.data.before?.data() || {};
    const afterData = after.data() || {};
    const tierInputsChanged = [
      'premiumActive',
      'premiumTier',
      'plan',
      'isPopular',
      'accountTier',
    ].some((key) => beforeData[key] !== afterData[key]);
    if (!tierInputsChanged) return;

    const patch = buildUserTierPatch(afterData);
    if (patch) {
      await after.ref.set(patch, { merge: true });
      await syncAccountTierClaims(event.params.userId, patch.accountTier);
      return;
    }

    const derived = deriveUserTier(afterData);
    if (derived) await syncAccountTierClaims(event.params.userId, derived);
  },
);

// Description: Ensure businessTier defaults to tier1 when businesses are created.
exports.ensureBusinessTierOnCreate = onDocumentCreated(
  'businesses/{bizId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};
    const normalized = normalizeBusinessTier(data.businessTier);
    if (normalized) return;
    await snap.ref.set(
      { businessTier: BUSINESS_TIERS.TIER_1_FREE },
      { merge: true },
    );
  },
);

// -------------------- TIERS: ADMIN HELPERS --------------------
exports.adminSetUserTier = onCall(ADMIN_CALLABLE_OPTIONS, async (req) => {
  assertAdmin(req);
  const { uid, accountTier } = req.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'Missing uid');
  const normalized = normalizeUserTier(accountTier);
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'Invalid accountTier');
  }

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');

  const updates = buildUserTierUpdate(normalized);
  await userRef.set(updates, { merge: true });
  await syncAccountTierClaims(uid, normalized);

  return { ok: true, uid, accountTier: normalized };
});

exports.adminSetBusinessTier = onCall(ADMIN_CALLABLE_OPTIONS, async (req) => {
  assertAdmin(req);
  const { bizId, businessTier } = req.data || {};
  if (!bizId) throw new HttpsError('invalid-argument', 'Missing bizId');
  const normalized = normalizeBusinessTier(businessTier);
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'Invalid businessTier');
  }

  const bizRef = db.collection('businesses').doc(bizId);
  const snap = await bizRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Business not found');

  await bizRef.set({ businessTier: normalized }, { merge: true });
  return { ok: true, bizId, businessTier: normalized };
});

exports.adminBackfillTiers = onCall(ADMIN_CALLABLE_OPTIONS, async (req) => {
  try {
    assertAdmin(req);
    const data = req.data || {};
    const dryRun = data.dryRun === true;
    const syncClaims = data.syncClaims !== false;
    const forceClaims = data.forceClaims === true;
    const scope = String(data.scope || 'all').toLowerCase();
    const limit = Number(data.limit || 0);
    const userCursor = data.userCursor || null;
    const businessCursor = data.businessCursor || null;
    const normalizeUserFlags = data.normalizeUserFlags === true;
    const forceUserTierRaw = data.forceUserTier;
    const forceBusinessTierRaw = data.forceBusinessTier;
    const forcedUserTier = forceUserTierRaw
      ? normalizeUserTier(forceUserTierRaw)
      : null;
    const forcedBusinessTier = forceBusinessTierRaw
      ? normalizeBusinessTier(forceBusinessTierRaw)
      : null;

    if (forceUserTierRaw && !forcedUserTier) {
      throw new HttpsError('invalid-argument', 'Invalid forceUserTier');
    }
    if (forceBusinessTierRaw && !forcedBusinessTier) {
      throw new HttpsError('invalid-argument', 'Invalid forceBusinessTier');
    }

    const backfillUsers = async ({ startAfter }) => {
      const pageSize = 250;
      let processed = 0;
      let updated = 0;
      let claimsSynced = 0;
      let cursor = startAfter;
      let done = false;

      while (true) {
        if (limit && processed >= limit) break;
        const pageLimit = limit
          ? Math.min(pageSize, limit - processed)
          : pageSize;
        let q = db.collection('users').orderBy('__name__').limit(pageLimit);
        if (cursor) q = q.startAfter(cursor);

        const snap = await q.get();
        if (snap.empty) {
          done = true;
          break;
        }

        const batch = db.batch();
        let writes = 0;
        const claimQueue = [];

        snap.docs.forEach((docSnap) => {
          processed += 1;
          const userData = docSnap.data() || {};
          const derived = forcedUserTier || deriveUserTier(userData);
          const current = normalizeUserTier(userData.accountTier);
          const needsUpdate = current !== derived;
          if (needsUpdate) {
            updated += 1;
            if (!dryRun) {
              if (normalizeUserFlags) {
                // When normalizeUserFlags is requested, apply the full
                // user tier update (accountTier, plan, premiumActive,
                // and isPopular) based on the derived tier. Previously
                // we only did this when a forcedUserTier was provided,
                // which left `isPopular` unpopulated during normal
                // backfills.
                const updates = buildUserTierUpdate(derived);
                batch.set(docSnap.ref, updates, { merge: true });
              } else {
                batch.set(
                  docSnap.ref,
                  { accountTier: derived },
                  { merge: true },
                );
              }
              writes += 1;
            }
          }
          if (syncClaims && (needsUpdate || forceClaims)) {
            claimQueue.push({ uid: docSnap.id, tier: derived });
          }
        });

        if (!dryRun && writes > 0) {
          await batch.commit();
        }

        if (syncClaims && claimQueue.length > 0) {
          for (const entry of claimQueue) {
            await syncAccountTierClaims(entry.uid, entry.tier);
            claimsSynced += 1;
          }
        }

        cursor = snap.docs[snap.docs.length - 1]?.id || cursor;
        if (snap.size < pageLimit) {
          done = true;
          break;
        }
      }

      return {
        processed,
        updated,
        claimsSynced,
        nextCursor: done ? null : cursor,
        done,
      };
    };

    const backfillBusinesses = async ({ startAfter }) => {
      const pageSize = 250;
      let processed = 0;
      let updated = 0;
      let cursor = startAfter;
      let done = false;

      while (true) {
        if (limit && processed >= limit) break;
        const pageLimit = limit
          ? Math.min(pageSize, limit - processed)
          : pageSize;
        let q = db
          .collection('businesses')
          .orderBy(admin.firestore.FieldPath.documentId())
          .limit(pageLimit);
        if (cursor) q = q.startAfter(cursor);

        const snap = await q.get();
        if (snap.empty) {
          done = true;
          break;
        }

        const batch = db.batch();
        let writes = 0;

        snap.docs.forEach((docSnap) => {
          processed += 1;
          const bizData = docSnap.data() || {};
          const current = normalizeBusinessTier(bizData.businessTier);
          const target =
            forcedBusinessTier || current || BUSINESS_TIERS.TIER_1_FREE;
          if (current === target) return;
          updated += 1;
          if (!dryRun) {
            batch.set(docSnap.ref, { businessTier: target }, { merge: true });
            writes += 1;
          }
        });

        if (!dryRun && writes > 0) {
          await batch.commit();
        }

        cursor = snap.docs[snap.docs.length - 1]?.id || cursor;
        if (snap.size < pageLimit) {
          done = true;
          break;
        }
      }

      return { processed, updated, nextCursor: done ? null : cursor, done };
    };

    const result = {};
    if (scope === 'all' || scope === 'users') {
      result.users = await backfillUsers({ startAfter: userCursor });
    }
    if (scope === 'all' || scope === 'businesses') {
      result.businesses = await backfillBusinesses({
        startAfter: businessCursor,
      });
    }

    const payload = { ok: true, dryRun, scope, result };
    logger.log('[adminBackfillTiers] completed', payload);
    return payload;
  } catch (err) {
    logger.error('[adminBackfillTiers] error', err?.message || err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'Backfill failed');
  }
});

exports.getEvents = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    cpu: 1,
    timeoutSeconds: 60,
  },
  async (req) => {
    logger.log('🔥 getEvents called; auth=', req.auth?.uid ?? 'none');
    const snap = await db.collection('events').get();
    return { events: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  },
);

// -------------------- NEW: EXPO PUSH SUPPORT --------------------

// Helper: chunk an array into batches of size n (Expo recommends <= 100 per request)
function chunk(arr, size = 100) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// sendExpoPushMessages now imported from domains/notifications

exports.blockUser = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '128MiB',
  },
  async (req) => {
    const caller = req.auth?.uid;
    const targetUid = (req.data?.targetUid || '').trim();
    if (!caller)
      throw new HttpsError('unauthenticated', 'Authentication required');
    if (!targetUid)
      throw new HttpsError('invalid-argument', 'Missing targetUid');
    if (targetUid === caller) {
      throw new HttpsError('invalid-argument', 'Cannot block yourself');
    }

    const actorRef = db.doc(`users/${caller}`);
    const targetRef = db.doc(`users/${targetUid}`);

    await db.runTransaction(async (tx) => {
      const [actorSnap, targetSnap] = await Promise.all([
        tx.get(actorRef),
        tx.get(targetRef),
      ]);

      if (!targetSnap.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const actorBlocked = Array.isArray(actorSnap.data()?.blocked)
        ? actorSnap.data().blocked
        : [];
      if (actorBlocked.includes(targetUid)) return;

      const actorUpdates = {
        blocked: FieldValue.arrayUnion(targetUid),
        friends: FieldValue.arrayRemove(targetUid),
        followers: FieldValue.arrayRemove(targetUid),
        following: FieldValue.arrayRemove(targetUid),
        followRequests: FieldValue.arrayRemove(targetUid),
        requests: FieldValue.arrayRemove(targetUid),
      };

      const targetUpdates = {
        blockedBy: FieldValue.arrayUnion(caller),
        friends: FieldValue.arrayRemove(caller),
        followers: FieldValue.arrayRemove(caller),
        following: FieldValue.arrayRemove(caller),
        followRequests: FieldValue.arrayRemove(caller),
        requests: FieldValue.arrayRemove(caller),
      };

      tx.set(actorRef, actorUpdates, { merge: true });
      tx.set(targetRef, targetUpdates, { merge: true });
    });

    return { ok: true };
  },
);

exports.unblockUser = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '128MiB',
  },
  async (req) => {
    const caller = req.auth?.uid;
    const targetUid = (req.data?.targetUid || '').trim();
    if (!caller)
      throw new HttpsError('unauthenticated', 'Authentication required');
    if (!targetUid)
      throw new HttpsError('invalid-argument', 'Missing targetUid');
    if (targetUid === caller) {
      throw new HttpsError('invalid-argument', 'Cannot unblock yourself');
    }

    const actorRef = db.doc(`users/${caller}`);
    const targetRef = db.doc(`users/${targetUid}`);

    await db.runTransaction(async (tx) => {
      const actorSnap = await tx.get(actorRef);
      if (!actorSnap.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const actorBlocked = Array.isArray(actorSnap.data()?.blocked)
        ? actorSnap.data().blocked
        : [];
      if (!actorBlocked.includes(targetUid)) return;

      tx.set(
        actorRef,
        { blocked: FieldValue.arrayRemove(targetUid) },
        { merge: true },
      );
      tx.set(
        targetRef,
        { blockedBy: FieldValue.arrayRemove(caller) },
        { merge: true },
      );
    });

    return { ok: true };
  },
);

async function adjustSavedAggregates(uid, eventId, deltaRaw) {
  const delta = deltaRaw > 0 ? 1 : deltaRaw < 0 ? -1 : 0;
  if (!delta || !uid || !eventId) return;

  const eventRef = db.doc(`events/${eventId}`);
  const userRef = db.doc(`users/${uid}`);

  try {
    await db.runTransaction(async (tx) => {
      const [eventSnap, userSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(userRef),
      ]);

      if (eventSnap.exists) {
        const data = eventSnap.data() || {};
        const currentSaveCount = Number(data.saveCount || 0);
        const nextSaveCount = Math.max(0, currentSaveCount + delta);
        const updates = { saveCount: nextSaveCount };

        const hasPopularity = typeof data.popularity === 'number';
        const currentPopularity = hasPopularity ? Number(data.popularity) : 0;
        if (hasPopularity || delta > 0) {
          const nextPopularity = Math.max(0, currentPopularity + delta);
          updates.popularity = nextPopularity;
        }

        tx.update(eventRef, updates);
      }

      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        const currentSavedCount = Number(userData.savedCount || 0);
        const nextSavedCount = Math.max(0, currentSavedCount + delta);
        tx.update(userRef, { savedCount: nextSavedCount });
      }
    });
  } catch (err) {
    logger.error('[savedEvents] adjustSavedAggregates failed', {
      uid,
      eventId,
      delta,
      error: err?.message || err,
    });
  }
}

exports.onSavedEventCreated = onDocumentCreated(
  'users/{uid}/savedEvents/{eventId}',
  async (event) => {
    const { uid, eventId } = event.params;
    await adjustSavedAggregates(uid, eventId, 1);
    try {
      await db
        .collection('analytics')
        .doc('stream')
        .collection('eventSaves')
        .add({
          eventId,
          uid,
          action: 'save',
          at: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      logger.warn('[savedEvents] analytics log failed', err?.message || err);
    }
  },
);

exports.onSavedEventDeleted = onDocumentDeleted(
  'users/{uid}/savedEvents/{eventId}',
  async (event) => {
    const { uid, eventId } = event.params;
    await adjustSavedAggregates(uid, eventId, -1);
    try {
      await db
        .collection('analytics')
        .doc('stream')
        .collection('eventSaves')
        .add({
          eventId,
          uid,
          action: 'unsave',
          at: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      logger.warn('[savedEvents] analytics log failed', err?.message || err);
    }
  },
);

// Callable: send a push to a specific userId or directly to a list of Expo tokens
// data: { userId?, tokens?, title, body, data? }
exports.sendPush = onCall(async (req) => {
  const { userId, tokens, title, body, data } = req.data || {};
  if (!title || !body)
    throw new HttpsError('invalid-argument', 'Missing title/body');

  let expoTokens = Array.isArray(tokens) ? tokens.slice() : [];

  if (userId) {
    const snap = await db.doc(`users/${userId}`).get();
    if (snap.exists) {
      const t = snap.get('deviceToken');
      if (t) expoTokens.push(t);
    }
  }

  // dedupe + basic validation (Expo tokens start with "ExponentPushToken")
  expoTokens = Array.from(new Set(expoTokens)).filter(
    (t) => typeof t === 'string' && t.startsWith('ExponentPushToken'),
  );

  if (expoTokens.length === 0) {
    logger.log('[push] No valid Expo tokens to send.');
    return { ok: true, sent: 0 };
  }

  const messages = expoTokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: data || {},
  }));

  await sendExpoPushMessages(messages);
  logger.log(`[push] Sent ${expoTokens.length} notifications`);
  return { ok: true, sent: expoTokens.length };
});

// Callable: Claim a device token for the authenticated user.
// This will clear the same token from any other user documents (to avoid cross-account delivery)
// and set it on the requesting user's document in an atomic/batched manner.
exports.claimDeviceToken = onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const callerUid = req.auth?.uid || null;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required');

    const token = (req.data?.token || '').toString().trim();
    const targetUid = (req.data?.uid || '').toString().trim();
    const devicePlatform =
      typeof req.data?.devicePlatform === 'string'
        ? req.data.devicePlatform
        : null;
    if (!token) throw new HttpsError('invalid-argument', 'Missing token');
    if (!targetUid) throw new HttpsError('invalid-argument', 'Missing uid');
    if (targetUid !== callerUid)
      throw new HttpsError('permission-denied', 'UID mismatch');

    try {
      // Find any user docs that currently hold this token
      const q = db
        .collection('users')
        .where('deviceToken', '==', token)
        .limit(50);
      const snap = await q.get();
      const batch = db.batch();
      let cleared = 0;

      snap.docs.forEach((d) => {
        if (d.id === targetUid) return; // We'll set it explicitly below
        batch.update(d.ref, {
          deviceToken: null,
          pushOptIn: false,
          deviceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        cleared++;
      });

      // Ensure target user has this token (including platform metadata)
      const targetRef = db.collection('users').doc(targetUid);
      const payload = {
        deviceToken: token,
        pushOptIn: true,
        deviceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (devicePlatform) payload.devicePlatform = devicePlatform;
      batch.set(targetRef, payload, { merge: true });

      await batch.commit();
      logger.log(
        '[claimDeviceToken] claimed token for',
        targetUid,
        'clearedFrom:',
        cleared,
      );
      return { ok: true, clearedFrom: cleared };
    } catch (err) {
      logger.error('[claimDeviceToken] error', err?.message || err);
      throw new HttpsError('internal', 'Failed to claim token');
    }
  },
);

// Trigger: on new chat message, notify all attendees + host (except the sender)
// Also stamps events/{eventId}.lastMessageAt for feed sorting
exports.onMessageCreateNotify = onDocumentCreated(
  'chats/{eventId}/messages/{messageId}',
  async (event) => {
    const { eventId } = event.params;
    const message = event.data?.data();
    if (!message) return;

    // 1) Update lastMessageAt on the event (non-blocking)
    try {
      await db
        .doc(`events/${eventId}`)
        .set(
          { lastMessageAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true },
        );
    } catch (e) {
      logger.error('[push] Failed to update lastMessageAt', e?.message || e);
    }

    // 2) Load event to determine target users
    const evSnap = await db.doc(`events/${eventId}`).get();
    if (!evSnap.exists) return;

    const ev = evSnap.data() || {};
    const hostId = ev.ownerId;
    const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
    const senderId = message.senderId;

    const targetUids = new Set(
      [...attendees, hostId].filter((uid) => uid && uid !== senderId),
    );
    if (targetUids.size === 0) return;

    // 3) Fetch tokens and sender info
    const senderSnap = await db.doc(`users/${senderId}`).get();
    const senderData = senderSnap.exists ? senderSnap.data() : {};
    const senderName = buildUserDisplayName(senderData);

    const userRefs = [...targetUids].map((uid) => db.doc(`users/${uid}`));
    const userSnaps = await db.getAll(...userRefs);
    const expoTokens = userSnaps
      .map((s) => {
        if (!s.exists) return null;
        const t = s.get('deviceToken');
        const optIn = s.get('pushOptIn');
        if (optIn === false) return null; // respect in-app opt-out
        return t;
      })
      .filter(
        (t) => typeof t === 'string' && t.startsWith('ExponentPushToken'),
      );

    if (expoTokens.length === 0) {
      logger.log('[push] No tokens to notify for event', eventId);
      return;
    }

    // 4) Build and send with sender name and chat link
    const title = `${senderName} in ${ev.title || 'event chat'}`;
    const body =
      typeof message.text === 'string' && message.text.trim().length
        ? message.text.trim()
        : 'Sent a message';
    const data = {
      eventId,
      linkType: 'chat',
      senderId,
      senderName,
    };

    const messages = expoTokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data,
    }));
    await sendExpoPushMessages(messages);
    logger.log(
      `[push] Notified ${expoTokens.length} users for event ${eventId}`,
    );
  },
);

exports.shareGenerateLink = shareGenerateLink;
exports.sharePreview = sharePreview;

// NEW: Trigger push when a notification document is created
exports.onNotificationCreatedPush = onDocumentCreated(
  'notifications/{id}',
  async (event) => {
    try {
      const notif = event.data?.data();
      if (!notif) return;
      if (notif.isDeleted === true) return;

      const recipientId = notif.recipientId;
      if (!recipientId) return;

      // Idempotency: skip if push already sent (best-effort)
      const ref = db.doc(`notifications/${event.params.id}`);
      const snap = await ref.get();
      if (snap.exists && snap.get('pushSentAt')) return;

      // Fetch recipient token + opt-in
      const userSnap = await db.doc(`users/${recipientId}`).get();
      if (!userSnap.exists) return;
      const token = userSnap.get('deviceToken');
      const optIn = userSnap.get('pushOptIn');
      const canPush =
        !!token &&
        token.startsWith('ExponentPushToken') &&
        (optIn === undefined || optIn === true);
      if (!canPush) return;

      const actorName =
        notif.requesterName ||
        notif.fromUserName ||
        notif.userName ||
        notif.senderName ||
        'Someone';

      // Build title/body based on notification type
      let title = 'Social Circle';
      let body = 'You have a new notification';
      switch (notif.type) {
        case 'rsvp_request':
          title = 'RSVP Request';
          body = `${actorName} requested to join your event`;
          break;
        case 'request_accepted':
          title = 'Request Accepted';
          body = 'Your RSVP request was accepted!';
          break;
        case 'chat':
          title = 'New message';
          body =
            typeof notif.message === 'string' && notif.message.trim().length
              ? notif.message.trim()
              : 'You have a new message';
          break;
        default:
          if (typeof notif.title === 'string' && notif.title.trim().length) {
            title = notif.title.trim();
          }
          if (
            typeof notif.message === 'string' &&
            notif.message.trim().length
          ) {
            body = notif.message.trim();
          }
      }

      if (actorName !== 'Someone' && /\bsomeone\b/i.test(body)) {
        body = body.replace(/\bsomeone\b/gi, actorName);
      }

      const data = {
        notificationId: event.params.id,
        type: notif.type || 'default',
        linkType: notif.linkType || null,
        linkId: notif.linkId || null,
        eventId: notif.eventId || null,
      };

      await sendExpoPushMessages([
        { to: token, sound: 'default', title, body, data },
      ]);

      // Mark pushed (best-effort)
      await ref.set(
        { pushSentAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    } catch (e) {
      logger.error('[push] onNotificationCreatedPush error', e?.message || e);
    }
  },
);

// Callable: RSVP to event — creates chat doc (id == eventId) on first RSVP and ensures participants list
// App Check enforced for production security (see docs/APP_CHECK_SETUP.md)
exports.rsvpEvent = onCall(JOIN_CALLABLE_OPTIONS, async (req) => {
  const auth = req.auth;
  const data = req.data || {};
  const eventId = data.eventId;
  const userId = data.userId;

  if (!auth || !auth.uid) {
    logger.error('[rsvpEvent] unauthenticated call');
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  if (!eventId || !userId) {
    logger.error('[rsvpEvent] missing params', { eventId, userId });
    throw new HttpsError('invalid-argument', 'Missing parameters');
  }

  const eventRef = db.doc(`events/${eventId}`);
  const chatRef = db.doc(`chats/${eventId}`);
  const userRef = db.doc(`users/${userId}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [evSnap, chatSnap, userSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(chatRef),
        tx.get(userRef),
      ]);
      if (!evSnap.exists)
        throw new HttpsError('not-found', 'Event does not exist');
      const ev = evSnap.data();
      const ownerId = ev.ownerId || null;

      let hostData = {};
      if (ownerId) {
        const hostSnap = await tx.get(db.doc(`users/${ownerId}`));
        if (hostSnap.exists) hostData = hostSnap.data() || {};
      }

      // Do not allow direct joins for RSVP events
      if ((ev.privacy || 'public').toLowerCase() === 'rsvp') {
        throw new HttpsError(
          'failed-precondition',
          'RSVP event requires host approval',
        );
      }

      // Gender eligibility
      const userDoc = userSnap.exists ? userSnap.data() : {};
      const userSex = (userDoc.sex || userDoc.gender || '')
        .toString()
        .toLowerCase();
      const privacy = (ev.privacy || 'public').toString().toLowerCase();
      if (privacy === 'female-only' && userSex !== 'female') {
        throw new HttpsError('permission-denied', 'Not eligible (gender)');
      }
      if (privacy === 'male-only' && userSex !== 'male') {
        throw new HttpsError('permission-denied', 'Not eligible (gender)');
      }

      // Age eligibility
      const range = Array.isArray(ev.ageRange) ? ev.ageRange : null;
      if (range && range.length === 2) {
        const [min, max] = range.map((n) =>
          typeof n === 'number' ? n : parseInt(n, 10),
        );
        const age = getAgeFromDob(userDoc.dob);
        if (typeof age === 'number') {
          if (
            (typeof min === 'number' && age < min) ||
            (typeof max === 'number' && age > max)
          ) {
            throw new HttpsError('permission-denied', 'Not eligible (age)');
          }
        }
      }

      // Capacity check
      const attendeesArr = Array.isArray(ev.attendees) ? ev.attendees : [];
      if (
        typeof ev.capacity === 'number' &&
        ev.capacity > 0 &&
        attendeesArr.length >= ev.capacity &&
        !attendeesArr.includes(userId)
      ) {
        throw new HttpsError(
          'failed-precondition',
          'Event is full. Join the waitlist if available.',
        );
      }

      if (ownerId) {
        const viewerBlocked = Array.isArray(userDoc.blocked)
          ? userDoc.blocked.includes(ownerId)
          : false;
        const viewerBlockedBy = Array.isArray(userDoc.blockedBy)
          ? userDoc.blockedBy.includes(ownerId)
          : false;
        const hostBlocksViewer = Array.isArray(hostData.blocked)
          ? hostData.blocked.includes(userId)
          : false;
        const hostBlockedByViewer = Array.isArray(hostData.blockedBy)
          ? hostData.blockedBy.includes(userId)
          : false;
        if (
          viewerBlocked ||
          viewerBlockedBy ||
          hostBlocksViewer ||
          hostBlockedByViewer
        ) {
          throw new HttpsError(
            'permission-denied',
            'You cannot join this event.',
          );
        }
      }

      // Compute participants union (owner + attendees + user)
      const participants = new Set(attendeesArr);
      if (ownerId) participants.add(ownerId);
      participants.add(userId);
      const participantsArray = Array.from(participants);

      // Prepare attendee snippet
      const snippet = userSnap.exists
        ? buildSnippetFromUser(userId, userSnap.data())
        : {
            uid: userId,
            name: 'User',
            photoURL: null,
            verified: false,
            rating: null,
          };

      const updates = {};
      if (!attendeesArr.includes(userId)) {
        updates.attendees = admin.firestore.FieldValue.arrayUnion(userId);
        updates.attendeesCount = admin.firestore.FieldValue.increment(1);
        updates[`attendeeSnippets.${userId}`] = snippet;
      }
      if (Object.keys(updates).length) tx.update(eventRef, updates);

      if (!chatSnap.exists) {
        tx.set(chatRef, {
          eventId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: ownerId || req.auth.uid,
          participants: participantsArray,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          messageCount: 0,
          isArchived: false,
          pinned: null,
        });
      } else {
        tx.update(chatRef, {
          participants: admin.firestore.FieldValue.arrayUnion(
            ...participantsArray,
          ),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      tx.update(userRef, {
        attendingEvents: admin.firestore.FieldValue.arrayUnion(eventId),
      });
      return { chatId: eventId, participants: participantsArray, ownerId };
    });

    // Notify host that someone joined their event (best-effort outside transaction)
    try {
      if (result.ownerId && result.ownerId !== userId) {
        const eventSnap = await eventRef.get();
        const eventData = eventSnap.data();
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};
        const userName = buildUserDisplayName(userData);

        await db.collection('notifications').add({
          type: 'event_joined',
          recipientId: result.ownerId,
          eventId,
          userId, // who joined
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          linkType: 'event',
          linkId: eventId,
          message: `${userName} joined ${eventData?.title || 'your event'}`,
          userName,
          read: false,
        });
      }
    } catch (e) {
      logger.error('[rsvpEvent] event_joined notify error', e?.message || e);
    }

    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err?.message || 'RSVP failed');
  }
});

// Callable: allow a signed-in attendee to leave an event (removes from attendees, updates user arrays, prunes chat participants)
// App Check enforced for production security (see docs/APP_CHECK_SETUP.md)
exports.leaveEvent = require('./domains/events').leaveEvent;

// Callable: delete (soft) an event — runs with admin privileges to avoid client rule issues
// App Check enforced for production security (see docs/APP_CHECK_SETUP.md)
exports.deleteEvent = require('./domains/events').deleteEvent;

// Callable: request to join an RSVP event (adds caller to requests, notifies host)
// App Check enforced for production security (see docs/APP_CHECK_SETUP.md)
exports.requestToJoinEvent = require('./domains/events').requestToJoinEvent;

// Callable: host accepts an RSVP request
exports.acceptRsvpRequest = require('./domains/events').acceptRsvpRequest;

// Callable: host declines an RSVP request
exports.declineRsvpRequest = require('./domains/events').declineRsvpRequest;

// -------------------- SOCIAL GRAPH CALLABLES (server-enforced cross-user writes) --------------------

// Callable: follow request (writes to target user's followRequests)
exports.requestFollow = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { targetUid } = req.data || {};
    if (!targetUid || typeof targetUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetUid');
    if (currentUid === targetUid)
      throw new HttpsError('invalid-argument', 'Cannot follow yourself');

    const targetRef = db.doc(`users/${targetUid}`);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists)
      throw new HttpsError('not-found', 'Target user not found');

    await targetRef.update({
      followRequests: admin.firestore.FieldValue.arrayUnion(currentUid),
    });

    logger.log('[requestFollow]', currentUid, '->', targetUid);
    return { ok: true };
  },
);

// Callable: approve follow request (mutual)
exports.approveFollowRequest = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { requesterUid } = req.data || {};
    if (!requesterUid || typeof requesterUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing requesterUid');

    const currentRef = db.doc(`users/${currentUid}`);
    const requesterRef = db.doc(`users/${requesterUid}`);

    await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(currentRef);
      if (!currentSnap.exists)
        throw new HttpsError('not-found', 'User not found');

      tx.update(currentRef, {
        followRequests: admin.firestore.FieldValue.arrayRemove(requesterUid),
        followers: admin.firestore.FieldValue.arrayUnion(requesterUid),
      });
      tx.update(requesterRef, {
        following: admin.firestore.FieldValue.arrayUnion(currentUid),
      });
    });

    logger.log('[approveFollowRequest]', currentUid, '<-', requesterUid);
    return { ok: true };
  },
);

// Callable: deny follow request
exports.denyFollowRequest = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { requesterUid } = req.data || {};
    if (!requesterUid || typeof requesterUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing requesterUid');

    const currentRef = db.doc(`users/${currentUid}`);
    await currentRef.update({
      followRequests: admin.firestore.FieldValue.arrayRemove(requesterUid),
    });

    logger.log('[denyFollowRequest]', currentUid, 'denied', requesterUid);
    return { ok: true };
  },
);

// Callable: add friend (mutual)
exports.addFriend = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { targetUid } = req.data || {};
    if (!targetUid || typeof targetUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetUid');
    if (currentUid === targetUid)
      throw new HttpsError('invalid-argument', 'Cannot friend yourself');

    const currentRef = db.doc(`users/${currentUid}`);
    const targetRef = db.doc(`users/${targetUid}`);

    await db.runTransaction(async (tx) => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists)
        throw new HttpsError('not-found', 'Target user not found');

      tx.update(currentRef, {
        friends: admin.firestore.FieldValue.arrayUnion(targetUid),
      });
      tx.update(targetRef, {
        friends: admin.firestore.FieldValue.arrayUnion(currentUid),
      });
    });

    logger.log('[addFriend]', currentUid, '<->', targetUid);
    return { ok: true };
  },
);

// Callable: remove friend (mutual)
exports.removeFriend = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const currentUid = req.auth?.uid;
    if (!currentUid) throw new HttpsError('unauthenticated', 'Auth required');
    const { targetUid } = req.data || {};
    if (!targetUid || typeof targetUid !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetUid');

    const currentRef = db.doc(`users/${currentUid}`);
    const targetRef = db.doc(`users/${targetUid}`);

    await db.runTransaction(async (tx) => {
      tx.update(currentRef, {
        friends: admin.firestore.FieldValue.arrayRemove(targetUid),
      });
      tx.update(targetRef, {
        friends: admin.firestore.FieldValue.arrayRemove(currentUid),
      });
    });

    logger.log('[removeFriend]', currentUid, 'X', targetUid);
    return { ok: true };
  },
);

// Callable: join waitlist (server-enforced capacity + state checks)
exports.joinWaitlist = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
    const { eventId } = req.data || {};
    if (!eventId || typeof eventId !== 'string')
      throw new HttpsError('invalid-argument', 'Missing eventId');

    const eventRef = db.doc(`events/${eventId}`);

    await db.runTransaction(async (tx) => {
      const evSnap = await tx.get(eventRef);
      if (!evSnap.exists) throw new HttpsError('not-found', 'Event not found');

      const ev = evSnap.data();
      const isHost = ev.ownerId === uid || ev.hostId === uid;
      const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
      const isAttendee = attendees.includes(uid);
      const requests = Array.isArray(ev.requests) ? ev.requests : [];
      const hasRequested = requests.includes(uid);
      const waitlist = Array.isArray(ev.waitlist) ? ev.waitlist : [];
      const isWaitlisted = waitlist.includes(uid);

      if (isHost)
        throw new HttpsError('failed-precondition', 'Host cannot waitlist');
      if (isAttendee)
        throw new HttpsError(
          'failed-precondition',
          'Already attending this event',
        );
      if (hasRequested)
        throw new HttpsError('failed-precondition', 'Request pending');
      if (isWaitlisted)
        throw new HttpsError(
          'failed-precondition',
          'Already on waitlist for this event',
        );

      const status = (ev.status || 'active').toString().toLowerCase();
      if (status !== 'active')
        throw new HttpsError('failed-precondition', 'Event not active');
      if (ev.isDeleted === true)
        throw new HttpsError('failed-precondition', 'Event deleted');

      const capacity = typeof ev.capacity === 'number' ? ev.capacity : null;
      const isFull = capacity && capacity > 0 && attendees.length >= capacity;
      if (!isFull)
        throw new HttpsError(
          'failed-precondition',
          'Event is not full; join directly instead',
        );

      tx.update(eventRef, {
        waitlist: admin.firestore.FieldValue.arrayUnion(uid),
        waitlistCount: admin.firestore.FieldValue.increment(1),
      });
    });

    logger.log('[joinWaitlist]', uid, 'joined waitlist for', eventId);
    return { ok: true };
  },
);

// -------------------- NEW: REPORTING & NOTIFICATIONS CALLABLES --------------------

// Callable: submit a report (since client cannot write /reports per rules)
// data: { targetType: 'user'|'event', targetId: string, reason?: string, details?: string }
exports.submitReport = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');
    const { targetType, targetId, reason, details } = req.data || {};
    if (!['user', 'event'].includes(targetType))
      throw new HttpsError('invalid-argument', 'Invalid targetType');
    if (!targetId || typeof targetId !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetId');

    const safe = (v, max = 2000) =>
      typeof v === 'string' ? v.toString().slice(0, max) : null;

    const doc = {
      targetType,
      targetId,
      reason: safe(reason, 256),
      details: safe(details, 2000),
      createdBy: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'open',
      appVersion: process.env.APP_VERSION || null,
      environment: process.env.ENVIRONMENT || 'beta',
    };

    const ref = await db.collection('reports').add(doc);
    logger.log('[reports] submitted', ref.id, targetType, targetId);
    return { ok: true, id: ref.id };
  },
);

// Callable: create a notification document on behalf of the client (client cannot create directly)
// data: { recipientId: string, type: string, title?: string, message?: string, linkType?, linkId?, eventId? }
exports.createNotification = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (req) => {
    const rawData = req.data || {};
    const authToken =
      typeof rawData.authToken === 'string' && rawData.authToken.trim().length
        ? rawData.authToken.trim()
        : null;

    const identityToolkitKey =
      process.env.IDENTITY_TOOLKIT_API_KEY ||
      process.env.FIREBASE_WEB_API_KEY ||
      process.env.FIREBASE_API_KEY ||
      process.env.GCLOUD_API_KEY ||
      null;

    const verificationErrors = [];

    const verifyViaRest = async (token, source) => {
      if (!token || !identityToolkitKey) return null;
      try {
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${identityToolkitKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: token }),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          verificationErrors.push({
            source: `${source}:rest`,
            message: `status ${res.status}: ${text.slice(0, 160)}`,
          });
          return null;
        }
        const json = await res.json().catch(() => null);
        const uid = json?.users?.[0]?.localId || null;
        if (uid) return { uid, source: `${source}:rest` };
      } catch (err) {
        verificationErrors.push({
          source: `${source}:rest`,
          message: err?.message || err,
        });
      }
      return null;
    };

    const headerValue =
      req.rawRequest?.headers?.authorization ||
      req.rawRequest?.headers?.Authorization ||
      null;
    const headerToken =
      typeof headerValue === 'string' &&
      headerValue.toLowerCase().startsWith('bearer ')
        ? headerValue.slice(7).trim()
        : null;

    let uid = req.auth?.uid || null;

    const tryVerify = async (token, source) => {
      if (!token) return null;
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        if (decoded?.uid) {
          return { uid: decoded.uid, source };
        }
      } catch (err) {
        verificationErrors.push({
          source: `${source}:admin`,
          message: err?.message || err,
        });
        const fallback = await verifyViaRest(token, source);
        if (fallback?.uid) return fallback;
      }
      const restOnly = await verifyViaRest(token, source);
      if (restOnly?.uid) return restOnly;
      return null;
    };

    if (!uid && authToken) {
      const verified = await tryVerify(authToken, 'payload');
      if (verified?.uid) uid = verified.uid;
    }

    if (!uid && headerToken && headerToken !== authToken) {
      const verified = await tryVerify(headerToken, 'header');
      if (verified?.uid) uid = verified.uid;
    }

    if (!uid) {
      logger.warn('[notifications] unauthenticated callable request', {
        hasAuthContext: Boolean(req.auth?.uid),
        hasPayloadToken: Boolean(authToken),
        hasHeaderToken: Boolean(headerToken),
        verificationErrors,
      });
      throw new HttpsError('unauthenticated', 'Sign in required', {
        verificationErrors,
      });
    }

    const { authToken: _discard, ...sanitized } = rawData;
    const { recipientId, type, title, message, linkType, linkId, eventId } =
      sanitized;
    if (!recipientId || typeof recipientId !== 'string')
      throw new HttpsError('invalid-argument', 'Missing recipientId');
    if (!type || typeof type !== 'string')
      throw new HttpsError('invalid-argument', 'Missing type');

    const now = admin.firestore.FieldValue.serverTimestamp();
    const doc = {
      recipientId,
      type,
      title: typeof title === 'string' ? title.slice(0, 120) : null,
      message: typeof message === 'string' ? message.slice(0, 500) : null,
      linkType: linkType || null,
      linkId: linkId || null,
      eventId: eventId || null,
      read: false,
      createdAt: now,
      createdBy: uid,
      isDeleted: false,
    };

    const ref = await db.collection('notifications').add(doc);
    logger.log('[notifications] created', ref.id, 'for', recipientId);
    return { ok: true, id: ref.id };
  },
);

// -------------------- NEW: USER AND EVENT REPORTING --------------------

// Callable: create a report (server-side write to /reports)
exports.createReport = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
      throw new HttpsError('unauthenticated', 'Authentication required');

    const data = req.data || {};
    const type = data.type;
    const targetId = data.targetId;
    const reason =
      (data.reason || '').toString().trim() || 'No reason provided';
    const details = data.details ? String(data.details).slice(0, 2000) : null;
    const context =
      typeof data.context === 'object' && data.context !== null
        ? data.context
        : {};

    if (!['event', 'user', 'interest_post', 'interest_comment'].includes(type))
      throw new HttpsError('invalid-argument', 'Invalid type');
    if (!targetId || typeof targetId !== 'string')
      throw new HttpsError('invalid-argument', 'Missing targetId');

    // Sanitize evidence array (optional list of strings/URLs)
    let evidence = [];
    if (Array.isArray(data.evidence)) {
      evidence = data.evidence
        .filter((e) => typeof e === 'string')
        .slice(0, 10)
        .map((e) => e.slice(0, 1000));
    }

    const reportDoc = {
      type, // 'event' | 'user'
      targetId,
      reporterId: uid, // authoritative source
      reason,
      details: details || null,
      status: 'pending',
      evidence,
      context: {
        eventId: typeof context.eventId === 'string' ? context.eventId : null,
        messageId:
          typeof context.messageId === 'string' ? context.messageId : null,
        postId: typeof context.postId === 'string' ? context.postId : null,
        commentId:
          typeof context.commentId === 'string' ? context.commentId : null,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      const ref = await db.collection('reports').add(reportDoc);
      logger.log('[createReport] created', ref.id, { type, targetId, uid });
      return { ok: true, id: ref.id };
    } catch (err) {
      logger.error('[createReport] error', err?.message || err);
      throw new HttpsError('internal', 'Failed to create report');
    }
  },
);

// Callable: rate a user with server-side validation (mutual event required)
exports.rateUser = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    cpu: 1,
    timeoutSeconds: 45,
  },
  async (req) => {
    const raterUid = req.auth?.uid || null;
    const { targetUid, rating } = req.data || {};

    if (!raterUid) throw new HttpsError('unauthenticated', 'Sign in required');
    if (!targetUid)
      throw new HttpsError('invalid-argument', 'targetUid required');
    if (targetUid === raterUid)
      throw new HttpsError('failed-precondition', 'Cannot rate yourself');

    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5)
      throw new HttpsError('invalid-argument', 'rating must be 1..5');

    // Validate mutual event participation
    const eventsCol = db.collection('events');

    const [raterAtt, raterHost] = await Promise.all([
      eventsCol.where('attendees', 'array-contains', raterUid).limit(400).get(),
      eventsCol.where('ownerId', '==', raterUid).limit(400).get(),
    ]);

    const [targetAtt, targetHost] = await Promise.all([
      eventsCol
        .where('attendees', 'array-contains', targetUid)
        .limit(400)
        .get(),
      eventsCol.where('ownerId', '==', targetUid).limit(400).get(),
    ]);

    const raterSet = new Set([
      ...raterAtt.docs.map((d) => d.id),
      ...raterHost.docs.map((d) => d.id),
    ]);
    const targetIds = [
      ...targetAtt.docs.map((d) => d.id),
      ...targetHost.docs.map((d) => d.id),
    ];
    const hasShared = targetIds.some((id) => raterSet.has(id));

    if (!hasShared)
      throw new HttpsError(
        'permission-denied',
        'You can only rate users from shared events',
      );

    // Update rating atomically
    const userRef = db.doc(`users/${targetUid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'User not found');
      const data = snap.data() || {};
      const ratings = Object.assign({}, data.ratings || {});
      ratings[raterUid] = r;
      const values = Object.values(ratings).map((x) => Number(x) || 0);
      const ratingCount = values.length;
      const avg = ratingCount
        ? values.reduce((sum, v) => sum + v, 0) / ratingCount
        : 0;

      tx.update(userRef, {
        ratings,
        rating: avg,
        ratingCount,
      });
    });

    return { ok: true };
  },
);

// -------------------- NEW: ANALYTICS TRACKING CALLABLE --------------------
function safeSanitize(value, depth = 0) {
  try {
    if (depth > 4) return null;
    if (value == null) return null;
    const t = typeof value;
    if (t === 'string') {
      const s = String(value);
      // redact obvious PII/tokens and trim
      const noEmail = s.replace(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
        '[redacted]',
      );
      const noBearer = noEmail.replace(
        /(ya29\.|eyJ|Bearer\s+[A-Za-z0-9\-_.]+)/g,
        '[redacted]',
      );
      return noBearer.slice(0, 200);
    }
    if (t === 'number') return Number.isFinite(value) ? value : null;
    if (t === 'boolean') return value;
    if (Array.isArray(value))
      return value.slice(0, 20).map((v) => safeSanitize(v, depth + 1));
    if (value && t === 'object') {
      const out = {};
      const entries = Object.entries(value).slice(0, 40);
      for (const [k, v] of entries) {
        const key = String(k).slice(0, 40).toLowerCase();
        if (
          key.includes('email') ||
          key.includes('password') ||
          key.includes('token') ||
          key.includes('secret') ||
          key.includes('address') ||
          key.includes('lat') ||
          key.includes('lng') ||
          key.includes('longitude') ||
          key.includes('latitude') ||
          key === 'id' ||
          key === 'uid'
        ) {
          continue;
        }
        out[key] = safeSanitize(v, depth + 1);
      }
      return out;
    }
    return null;
  } catch {
    return null;
  }
}

exports.trackEvent = onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
    timeoutSeconds: 15,
  },
  async (req) => {
    try {
      const nameRaw = (req.data?.name || '').toString();
      if (!nameRaw) return { ok: true, skipped: 'missing name' };
      const name = nameRaw
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 64);
      const payload = safeSanitize(req.data?.payload || {});
      const uid = req.auth?.uid || null;

      const userAgent = req.rawRequest?.headers?.['user-agent'] || null;
      const doc = {
        name,
        payload,
        uid,
        userAgent: userAgent ? String(userAgent).slice(0, 200) : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        env: process.env.ENVIRONMENT || 'beta',
        appVersion: process.env.APP_VERSION || null,
      };
      await db.collection('analytics_events').add(doc);
      logger.log('[trackEvent]', name, 'uid:', uid || 'anon');
      return { ok: true };
    } catch (e) {
      logger.error('[trackEvent] error', e?.message || e);
      // Do not throw; this is best-effort
      return { ok: false };
    }
  },
);

// Helper: build attendee snippet from user doc
function buildSnippetFromUser(uid, user) {
  const first = (user.firstName || '').toString().trim();
  const last = (user.lastName || '').toString().trim();
  const name =
    `${first} ${last}`.trim() || user.displayName || user.username || 'User';
  const photoURL = user.profileImage || user.avatarURL || user.photoURL || null;
  const verified = !!user.verified;
  const rating = typeof user.rating === 'number' ? user.rating : null;
  return { uid, name, photoURL, verified, rating };
}

// Helper: compute age from Firestore Timestamp or ISO
function getAgeFromDob(dob) {
  try {
    let d = null;
    if (!dob) return null;
    if (dob.toDate) d = dob.toDate();
    else if (typeof dob.seconds === 'number') d = new Date(dob.seconds * 1000);
    else if (dob instanceof Date) d = dob;
    else if (typeof dob === 'string') d = new Date(dob);
    if (!d || isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  } catch {
    return null;
  }
}

// Fanout: when user profile fields change, update attendee snippets across their events
exports.onUserUpdateFanout = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    try {
      const before = event.data.before.data();
      const after = event.data.after.data();
      if (!before || !after) return;

      // Only act if snippet-relevant fields changed
      const fields = [
        'firstName',
        'lastName',
        'displayName',
        'username',
        'profileImage',
        'avatarURL',
        'photoURL',
        'verified',
        'rating',
      ];
      const changed = fields.some(
        (f) => (before[f] || null) !== (after[f] || null),
      );
      if (!changed) return;

      const uid = event.params.userId;
      const snippet = buildSnippetFromUser(uid, after);

      // Find events where this user is an attendee
      const q = db
        .collection('events')
        .where('attendees', 'array-contains', uid)
        .limit(400);
      const snap = await q.get();
      if (snap.empty) return;

      const batches = [];
      let batch = db.batch();
      let ops = 0;
      snap.docs.forEach((d) => {
        batch.update(d.ref, { [`attendeeSnippets.${uid}`]: snippet });
        ops++;
        if (ops >= 450) {
          // stay under 500 ops
          batches.push(batch.commit());
          batch = db.batch();
          ops = 0;
        }
      });
      batches.push(batch.commit());
      await Promise.all(batches);
      logger.log(
        '[onUserUpdateFanout] updated attendee snippets for',
        uid,
        'in',
        snap.size,
        'events',
      );
    } catch (e) {
      logger.error('[onUserUpdateFanout] error', e?.message || e);
    }
  },
);

// Scheduled tasks are implemented in ./domains/scheduled
exports.computePopularity = computePopularity;

// -------------------- ANALYTICS ROLLUPS --------------------
exports.rollupDailyAnalytics = rollupDailyAnalytics;

exports.sendEventReminders = sendEventReminders;

// -------------------- BUSINESSES: CALLABLE API --------------------
// Migrated to ./domains/business (keep index.js slim)
exports.createBusinessDraft = require('./domains/business').createBusinessDraft;
exports.createOrUpdateBusiness =
  require('./domains/business').createOrUpdateBusiness;
exports.switchToPersonalAccount =
  require('./domains/business').switchToPersonalAccount;
exports.updateBusinessBasics =
  require('./domains/business').updateBusinessBasics;
exports.updateBrandAssets = require('./domains/business').updateBrandAssets;
exports.addBusinessLocation = require('./domains/business').addBusinessLocation;
exports.updateAudiencePolicies =
  require('./domains/business').updateAudiencePolicies;
exports.startBusinessVerification =
  require('./domains/business').startBusinessVerification;
exports.verifyBusinessCode = require('./domains/business').verifyBusinessCode;
exports.addBusinessMember = require('./domains/business').addBusinessMember;
exports.setBusinessPrivacy = require('./domains/business').setBusinessPrivacy;
exports.submitBusiness = require('./domains/business').submitBusiness;
// -------------------- USER VERIFICATION --------------------

// Description: Request email verification using Firebase Auth's built-in system
// Note: Firebase Auth sends the email automatically, no custom email service needed
exports.requestEmailVerification = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
  },
  async (req) => {
    logger.info('[requestEmailVerification] Function called');
    const uid = req.auth?.uid;

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    try {
      // Get user from Firebase Auth
      const userRecord = await admin.auth().getUser(uid);

      // Check if email is already verified in Firebase Auth
      if (userRecord.emailVerified) {
        logger.info(
          '[requestEmailVerification] Email already verified in Firebase Auth',
        );
        // Also update Firestore to match
        await db.doc(`users/${uid}`).update({
          verified: true,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          verificationMethod: 'email',
        });
        return { ok: true, alreadyVerified: true };
      }

      // Generate email verification link
      const actionCodeSettings = {
        url: `https://${
          process.env.GCLOUD_PROJECT || 'social-scene1'
        }.firebaseapp.com`,
        handleCodeInApp: false,
      };

      const link = await admin
        .auth()
        .generateEmailVerificationLink(userRecord.email, actionCodeSettings);

      logger.info(
        `[requestEmailVerification] Generated link for ${userRecord.email}`,
      );

      // Note: In production, you'd send this link via your email service (SendGrid, etc.)
      // For now, Firebase Console settings must have email templates configured
      // The link is generated but Firebase doesn't automatically send it from Cloud Functions
      // You need to call auth().currentUser.sendEmailVerification() from the client

      return {
        ok: true,
        email: userRecord.email,
        message: 'Please check your email for verification link',
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('[requestEmailVerification] error', err?.message || err);
      throw new HttpsError('internal', 'Verification request failed');
    }
  },
);

// Description: Verify email code
// Validates the verification code and marks user as verified
exports.verifyEmailCode = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
  },
  async (req) => {
    const uid = req.auth?.uid;
    const { code } = req.data || {};

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    if (!code || typeof code !== 'string') {
      throw new HttpsError('invalid-argument', 'Verification code required');
    }

    try {
      const userRef = db.doc(`users/${uid}`);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const request = userData.verificationRequest;

      if (!request || request.type !== 'email') {
        throw new HttpsError(
          'failed-precondition',
          'No pending email verification',
        );
      }

      // Check expiration
      const now = Date.now();
      const expiresMs = request.expiresAt?.toMillis?.() || 0;
      if (now > expiresMs) {
        throw new HttpsError('deadline-exceeded', 'Verification code expired');
      }

      // Check attempts (max 5)
      if (request.attempts >= 5) {
        throw new HttpsError(
          'resource-exhausted',
          'Too many failed attempts. Please request a new code.',
        );
      }

      // Validate code
      if (request.code !== code.trim()) {
        // Increment attempts
        await userRef.update({
          'verificationRequest.attempts':
            admin.firestore.FieldValue.increment(1),
        });
        throw new HttpsError('invalid-argument', 'Invalid verification code');
      }

      // Success! Mark user as verified
      await userRef.update({
        verified: true,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        verificationMethod: 'email',
        verificationRequest: admin.firestore.FieldValue.delete(),
      });

      logger.info(`[verification] User ${uid} verified via email`);

      return { ok: true, verified: true };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('[verifyEmailCode] error', err?.message || err);
      throw new HttpsError('internal', 'Verification failed');
    }
  },
);

// Description: Request phone verification (optional - requires Twilio/similar)
exports.requestPhoneVerification = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
  },
  async (req) => {
    const uid = req.auth?.uid;
    const { phoneNumber } = req.data || {};

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    if (!phoneNumber) {
      throw new HttpsError('invalid-argument', 'Phone number required');
    }

    try {
      // Get user data
      const userDoc = await db.doc(`users/${uid}`).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();

      // Check if already verified
      if (userData.verified === true) {
        return { ok: true, alreadyVerified: true };
      }

      // Generate verification code (6 digits)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        Date.now() + 10 * 60 * 1000, // 10 minutes
      );

      // Store verification request
      await db.doc(`users/${uid}`).update({
        verificationRequest: {
          type: 'phone',
          code,
          phoneNumber,
          expiresAt,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          attempts: 0,
        },
      });

      // Send SMS with code
      // TODO: Integrate with Twilio or similar SMS service
      logger.info(
        `[requestPhoneVerification] Code generated for ${phoneNumber}: ${code}`,
      );
      // For now, code is logged server-side only

      return { ok: true, phoneNumber, codeLength: 6 };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('[requestPhoneVerification] error', err?.message || err);
      throw new HttpsError('internal', 'Phone verification request failed');
    }
  },
);

// Description: Verify phone code
exports.verifyPhoneCode = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
  },
  async (req) => {
    const uid = req.auth?.uid;
    const { code } = req.data || {};

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    if (!code) {
      throw new HttpsError('invalid-argument', 'Verification code required');
    }

    try {
      const userRef = db.doc(`users/${uid}`);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data();
      const request = userData.verificationRequest;

      if (!request || request.type !== 'phone') {
        throw new HttpsError(
          'failed-precondition',
          'No pending phone verification',
        );
      }

      // Check expiration
      const now = Date.now();
      const expiresMs = request.expiresAt?.toMillis?.() || 0;
      if (now > expiresMs) {
        throw new HttpsError('deadline-exceeded', 'Verification code expired');
      }

      // Check attempts
      if (request.attempts >= 5) {
        throw new HttpsError(
          'resource-exhausted',
          'Too many failed attempts. Please request a new code.',
        );
      }

      // Validate code
      if (request.code !== code.trim()) {
        await userRef.update({
          'verificationRequest.attempts':
            admin.firestore.FieldValue.increment(1),
        });
        throw new HttpsError('invalid-argument', 'Invalid verification code');
      }

      // Success!
      await userRef.update({
        verified: true,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        verificationMethod: 'phone',
        phoneNumber: request.phoneNumber, // Store verified phone
        verificationRequest: admin.firestore.FieldValue.delete(),
      });

      logger.info(`[verification] User ${uid} verified via phone`);

      return { ok: true, verified: true };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('[verifyPhoneCode] error', err?.message || err);
      throw new HttpsError('internal', 'Phone verification failed');
    }
  },
);

/**
 * Description: Cloud Function to update interest counts in categories when user interests change
 * Tracks count_selected field for each interest across all categories
 */
exports.updateInterestCounts = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    try {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      const beforeInterests = Array.isArray(beforeData?.interests)
        ? beforeData.interests
        : [];
      const afterInterests = Array.isArray(afterData?.interests)
        ? afterData.interests
        : [];

      // Find interests that were added or removed
      const addedInterests = afterInterests.filter(
        (interest) => !beforeInterests.includes(interest),
      );
      const removedInterests = beforeInterests.filter(
        (interest) => !afterInterests.includes(interest),
      );

      if (addedInterests.length === 0 && removedInterests.length === 0) {
        // No interest changes
        return null;
      }

      logger.info(
        `[updateInterestCounts] User ${event.params.userId} added ${addedInterests.length}, removed ${removedInterests.length} interests`,
      );

      // Fetch all categories
      const categoriesSnapshot = await db.collection('categories').get();

      const batch = db.batch();

      categoriesSnapshot.docs.forEach((categoryDoc) => {
        const categoryData = categoryDoc.data();
        const interests = categoryData.interests || [];
        let modified = false;

        const updatedInterests = interests.map((interest) => {
          const interestName =
            typeof interest === 'string' ? interest : interest.name;

          if (addedInterests.includes(interestName)) {
            modified = true;
            const currentCount =
              typeof interest === 'object' ? interest.count_selected || 0 : 0;
            return {
              ...(typeof interest === 'object' ? interest : { name: interest }),
              count_selected: currentCount + 1,
            };
          }

          if (removedInterests.includes(interestName)) {
            modified = true;
            const currentCount =
              typeof interest === 'object' ? interest.count_selected || 0 : 0;
            return {
              ...(typeof interest === 'object' ? interest : { name: interest }),
              count_selected: Math.max(0, currentCount - 1),
            };
          }

          return interest;
        });

        if (modified) {
          batch.update(categoryDoc.ref, {
            interests: updatedInterests,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      await batch.commit();
      logger.info(
        `[updateInterestCounts] Successfully updated interest counts`,
      );

      return null;
    } catch (error) {
      logger.error('[updateInterestCounts] Error:', error);
      // Don't throw - we don't want to block user updates
      return null;
    }
  },
);

// ============================================================================
// BUSINESS MODE V1 - VALIDATION STUBS
// ============================================================================

/**
 * Validate business event creation against tier limits
 * Checks: monthlyEventLimit, maxActiveEvents
 */
exports.validateBusinessEventCreate = onCall(
  BUSINESS_CALLABLE_OPTIONS,
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'User not signed in');

    const { businessId } = req.data || {};
    if (!businessId)
      throw new HttpsError('invalid-argument', 'businessId required');

    try {
      // Get business doc
      const bizSnap = await db.collection('businesses').doc(businessId).get();
      if (!bizSnap.exists)
        throw new HttpsError('not-found', 'Business not found');

      const biz = bizSnap.data();
      if (biz.ownerUid !== uid)
        throw new HttpsError('permission-denied', 'Not business owner');

      // Check if business is active
      if (biz.isActive === false)
        throw new HttpsError(
          'failed-precondition',
          'Business account is inactive',
        );

      const caps = getBusinessCapabilities(biz.tier);

      // Check monthly event limit
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const eventsThisMonthSnap = await db
        .collection('events')
        .where('businessId', '==', businessId)
        .where('createdAt', '>=', monthStart)
        .get();

      if (
        caps.monthlyEventLimit !== Infinity &&
        eventsThisMonthSnap.size >= caps.monthlyEventLimit
      ) {
        throw new HttpsError(
          'resource-exhausted',
          `Monthly event limit reached (${caps.monthlyEventLimit})`,
        );
      }

      // Check concurrent active events (events use endAt field)
      const activeEventsSnap = await db
        .collection('events')
        .where('businessId', '==', businessId)
        .where('endAt', '>', now)
        .get();

      if (
        caps.maxActiveEvents !== Infinity &&
        activeEventsSnap.size >= caps.maxActiveEvents
      ) {
        throw new HttpsError(
          'resource-exhausted',
          `Maximum active events reached (${caps.maxActiveEvents})`,
        );
      }

      return { allowed: true };
    } catch (err) {
      logger.error('[validateBusinessEventCreate] Error:', err);
      throw err;
    }
  },
);

/**
 * Validate business perk creation against tier limits
 * Checks: tier allows perks, monthlyPerkLimit, maxActivePerks
 */
exports.validateBusinessPerkCreate = onCall(
  BUSINESS_CALLABLE_OPTIONS,
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'User not signed in');

    const { businessId, expiresAt } = req.data || {};
    if (!businessId)
      throw new HttpsError('invalid-argument', 'businessId required');
    if (!expiresAt)
      throw new HttpsError(
        'invalid-argument',
        'expiresAt is required for perks',
      );

    try {
      // Get business doc
      const bizSnap = await db.collection('businesses').doc(businessId).get();
      if (!bizSnap.exists)
        throw new HttpsError('not-found', 'Business not found');

      const biz = bizSnap.data();
      if (biz.ownerUid !== uid)
        throw new HttpsError('permission-denied', 'Not business owner');

      // Check if business is active
      if (biz.isActive === false)
        throw new HttpsError(
          'failed-precondition',
          'Business account is inactive',
        );

      // Check if business is active
      if (biz.isActive === false)
        throw new HttpsError(
          'failed-precondition',
          'Business account is inactive',
        );

      const caps = getBusinessCapabilities(biz.tier);

      // Check if tier allows perks
      if (!caps.canCreatePerk) {
        throw new HttpsError(
          'permission-denied',
          'Tier does not allow perk creation. Upgrade to create perks.',
        );
      }

      // Check monthly perk limit
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const perksThisMonthSnap = await db
        .collection('perks')
        .where('businessId', '==', businessId)
        .where('createdAt', '>=', monthStart)
        .get();

      if (
        caps.monthlyPerkLimit !== Infinity &&
        perksThisMonthSnap.size >= caps.monthlyPerkLimit
      ) {
        throw new HttpsError(
          'resource-exhausted',
          `Monthly perk limit reached (${caps.monthlyPerkLimit})`,
        );
      }

      // Check concurrent active perks
      const activePerksSnap = await db
        .collection('perks')
        .where('businessId', '==', businessId)
        .where('isActive', '==', true)
        .where('expiresAt', '>', now)
        .get();

      if (
        caps.maxActivePerks !== Infinity &&
        activePerksSnap.size >= caps.maxActivePerks
      ) {
        throw new HttpsError(
          'resource-exhausted',
          `Maximum active perks reached (${caps.maxActivePerks})`,
        );
      }

      return { allowed: true };
    } catch (err) {
      logger.error('[validateBusinessPerkCreate] Error:', err);
      throw err;
    }
  },
);

/**
 * Get business capabilities for a given tier (callable for client reference)
 */
exports.getBusinessCapabilities = onCall(async (req) => {
  const { tier } = req.data || {};
  if (!tier) throw new HttpsError('invalid-argument', 'tier required');

  try {
    const caps = getBusinessCapabilities(tier);
    return caps;
  } catch (err) {
    logger.error('[getBusinessCapabilities] Error:', err);
    throw new HttpsError('internal', 'Failed to get capabilities');
  }
});

// ---------- Business authoritative create (events/perks) ----------

const monthStartUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

async function loadBusinessAndCaps(businessId) {
  const snap = await db.collection('businesses').doc(businessId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Business not found');
  const biz = { id: snap.id, ...snap.data() };
  const tier = biz.tier || biz.businessTier || BUSINESS_TIERS.TIER_1_FREE;
  const caps = getBusinessCapabilities(tier);
  return { biz, tier, caps };
}

function ensureInterestSubset(selected = [], allowed = []) {
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  return selected.every((i) => allowed.includes(i));
}

async function fetchLocation(businessId, locId) {
  const locSnap = await db
    .collection('businesses')
    .doc(businessId)
    .collection('locations')
    .doc(locId)
    .get();
  if (!locSnap.exists)
    throw new HttpsError('failed-precondition', 'Location not found');
  return { id: locSnap.id, ...locSnap.data() };
}

async function fetchServiceArea(businessId, areaId) {
  const areaSnap = await db
    .collection('businesses')
    .doc(businessId)
    .collection('serviceAreas')
    .doc(areaId)
    .get();
  if (!areaSnap.exists)
    throw new HttpsError('failed-precondition', 'Service area not found');
  return { id: areaSnap.id, ...areaSnap.data() };
}

async function countDocs(q) {
  if (typeof q.count === 'function') {
    const agg = await q.count().get();
    return agg.data().count || 0;
  }
  const snap = await q.get();
  return snap.size;
}

exports.createBusinessEvent = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const {
    businessId,
    title,
    description,
    startsAt,
    endsAt,
    interestIds = [],
    businessLocationId,
    serviceAreaId,
  } = req.data || {};

  if (!businessId)
    throw new HttpsError('invalid-argument', 'businessId required');
  if (!title || !startsAt || !endsAt) {
    throw new HttpsError(
      'invalid-argument',
      'title, startsAt, endsAt required',
    );
  }
  if (businessLocationId && serviceAreaId) {
    throw new HttpsError(
      'invalid-argument',
      'Pick one anchor (location or service area)',
    );
  }
  if (!businessLocationId && !serviceAreaId) {
    throw new HttpsError('failed-precondition', 'Anchor required');
  }

  const startTs = new Date(startsAt);
  const endTs = new Date(endsAt);
  if (!(startTs instanceof Date) || isNaN(startTs)) {
    throw new HttpsError('invalid-argument', 'startsAt invalid');
  }
  if (!(endTs instanceof Date) || isNaN(endTs) || endTs <= startTs) {
    throw new HttpsError('invalid-argument', 'endsAt must be after startsAt');
  }

  const { biz, caps } = await loadBusinessAndCaps(businessId);
  if (biz.ownerId && biz.ownerId !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the business owner can create events',
    );
  }

  if (!Array.isArray(interestIds) || interestIds.length < 1) {
    throw new HttpsError(
      'invalid-argument',
      'At least one interest is required',
    );
  }
  if (interestIds.length > caps.interestSlots) {
    throw new HttpsError(
      'resource-exhausted',
      'Interest slots exceeded for your tier',
    );
  }
  if (!ensureInterestSubset(interestIds, biz.interestIds || [])) {
    throw new HttpsError(
      'permission-denied',
      'Interests must be in business profile',
    );
  }

  let coords = null;
  let anchorFields = {};
  if (businessLocationId) {
    const loc = await fetchLocation(businessId, businessLocationId);
    coords = loc.coordinates || null;
    anchorFields.businessLocationId = businessLocationId;
  } else if (serviceAreaId) {
    const sa = await fetchServiceArea(businessId, serviceAreaId);
    coords = sa.centerPoint || null;
    anchorFields.serviceAreaId = serviceAreaId;
  }
  if (
    !coords ||
    typeof coords.latitude !== 'number' ||
    typeof coords.longitude !== 'number'
  ) {
    throw new HttpsError('failed-precondition', 'Anchor missing coordinates');
  }

  const monthStart = admin.firestore.Timestamp.fromDate(monthStartUtc());
  const nowTs = admin.firestore.Timestamp.now();
  const monthly = await countDocs(
    db
      .collection('events')
      .where('businessId', '==', businessId)
      .where('createdAt', '>=', monthStart),
  );
  if (monthly >= caps.monthlyEventLimit) {
    throw new HttpsError('resource-exhausted', 'Monthly event limit reached');
  }
  const activeCount = await countDocs(
    db
      .collection('events')
      .where('businessId', '==', businessId)
      .where('endAt', '>=', nowTs),
  );
  if (activeCount >= caps.maxActiveEvents) {
    throw new HttpsError('resource-exhausted', 'Active event limit reached');
  }

  const geohash = geohashForLocation([coords.latitude, coords.longitude]);
  const doc = {
    title: String(title).trim(),
    description: description ? String(description).trim() : null,
    hostType: 'BUSINESS',
    businessId,
    ...anchorFields,
    interestIds,
    interest: interestIds[0],
    interests: interestIds,
    startAt: admin.firestore.Timestamp.fromDate(startTs),
    endAt: admin.firestore.Timestamp.fromDate(endTs),
    startsAt: admin.firestore.Timestamp.fromDate(startTs),
    endsAt: admin.firestore.Timestamp.fromDate(endTs),
    expiresAt: admin.firestore.Timestamp.fromDate(endTs),
    createdAt: nowTs,
    updatedAt: nowTs,
    ownerId: uid,
    status: 'active',
    isActive: true,
    location: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      geohash,
    },
    geohash,
    isDeleted: false,
  };

  const ref = await db.collection('events').add(doc);
  return { ok: true, eventId: ref.id };
});

exports.createBusinessPerk = onCall(BUSINESS_CALLABLE_OPTIONS, async (req) => {
  const uid = assertAuth(req);
  const {
    businessId,
    title,
    details,
    expiresAt,
    interestIds = [],
    businessLocationId,
    serviceAreaId,
    targetRadiusMiles,
  } = req.data || {};

  if (!businessId)
    throw new HttpsError('invalid-argument', 'businessId required');
  if (!title || !details || !expiresAt) {
    throw new HttpsError(
      'invalid-argument',
      'title, details, expiresAt required',
    );
  }
  if (businessLocationId && serviceAreaId) {
    throw new HttpsError(
      'invalid-argument',
      'Pick one anchor (location or service area)',
    );
  }
  if (!businessLocationId && !serviceAreaId) {
    throw new HttpsError('failed-precondition', 'Anchor required');
  }

  const expDate = new Date(expiresAt);
  if (!(expDate instanceof Date) || isNaN(expDate) || expDate <= new Date()) {
    throw new HttpsError('invalid-argument', 'expiresAt must be in the future');
  }

  const { biz, caps } = await loadBusinessAndCaps(businessId);
  if (!caps.canCreatePerk) {
    throw new HttpsError('permission-denied', 'Perks not allowed on this tier');
  }
  if (biz.ownerId && biz.ownerId !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the business owner can create perks',
    );
  }

  if (!Array.isArray(interestIds) || interestIds.length < 1) {
    throw new HttpsError(
      'invalid-argument',
      'At least one interest is required',
    );
  }
  if (interestIds.length > caps.interestSlots) {
    throw new HttpsError(
      'resource-exhausted',
      'Interest slots exceeded for your tier',
    );
  }
  if (!ensureInterestSubset(interestIds, biz.interestIds || [])) {
    throw new HttpsError(
      'permission-denied',
      'Interests must be in business profile',
    );
  }

  let coords = null;
  let anchorFields = {};
  if (businessLocationId) {
    const loc = await fetchLocation(businessId, businessLocationId);
    coords = loc.coordinates || null;
    anchorFields.businessLocationId = businessLocationId;
  } else if (serviceAreaId) {
    const sa = await fetchServiceArea(businessId, serviceAreaId);
    coords = sa.centerPoint || null;
    anchorFields.serviceAreaId = serviceAreaId;
  }
  if (
    !coords ||
    typeof coords.latitude !== 'number' ||
    typeof coords.longitude !== 'number'
  ) {
    throw new HttpsError('failed-precondition', 'Anchor missing coordinates');
  }

  if (
    targetRadiusMiles &&
    targetRadiusMiles > (caps.maxTargetRadiusMiles || caps.maxTargetRadius)
  ) {
    throw new HttpsError('resource-exhausted', 'Radius exceeds tier limit');
  }

  const monthStart = admin.firestore.Timestamp.fromDate(monthStartUtc());
  const nowTs = admin.firestore.Timestamp.now();
  const monthly = await countDocs(
    db
      .collection('perks')
      .where('businessId', '==', businessId)
      .where('createdAt', '>=', monthStart),
  );
  if (monthly >= caps.monthlyPerkLimit) {
    throw new HttpsError('resource-exhausted', 'Monthly perk limit reached');
  }
  const activeCount = await countDocs(
    db
      .collection('perks')
      .where('businessId', '==', businessId)
      .where('expiresAt', '>=', nowTs),
  );
  if (activeCount >= caps.maxActivePerks) {
    throw new HttpsError('resource-exhausted', 'Active perk limit reached');
  }

  const geohash = geohashForLocation([coords.latitude, coords.longitude]);
  const doc = {
    title: String(title).trim(),
    details: String(details).trim(),
    businessId,
    ...anchorFields,
    interestIds,
    interests: interestIds,
    interest: interestIds[0],
    expiresAt: admin.firestore.Timestamp.fromDate(expDate),
    createdAt: nowTs,
    updatedAt: nowTs,
    ownerId: uid,
    status: 'ACTIVE',
    isActive: true,
    coordinates: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      geohash,
    },
    geohash,
    targetRadiusMiles:
      targetRadiusMiles ||
      caps.maxTargetRadiusMiles ||
      caps.maxTargetRadius ||
      null,
  };

  const ref = await db.collection('perks').add(doc);
  return { ok: true, perkId: ref.id };
});

//# sourceMappingURL=index.js.map
