const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { truncate, toDate, incrementCounter } = require('../shared/helpers');

const db = admin.firestore();

// ---------- Helpers ----------
function dayKeyFromDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

function getYesterdayRangeUTC() {
  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1,
      0,
      0,
      0,
    ),
  );
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
    ),
  );
  return { start, end, key: dayKeyFromDate(start) };
}

function safeKey(s) {
  try {
    if (!s) return null;
    const str = String(s).toLowerCase();
    return str.replace(/[^a-z0-9_-]/g, '-').slice(0, 120) || null;
  } catch {
    return null;
  }
}

function isAggregatableEvent(name) {
  return (
    name === 'card_impression' ||
    name === 'card_click' ||
    name === 'open_event' ||
    name === 'save_event' ||
    name === 'share_event' ||
    name === 'rsvp_yes' ||
    name === 'join_event' ||
    name === 'check_in' ||
    name === 'report_content'
  );
}

async function paginateQuery(q, onBatch) {
  let last = null;
  const pageSize = 1000;
  while (true) {
    let cur = q.orderBy('createdAt').limit(pageSize);
    if (last) cur = cur.startAfter(last);
    const snap = await cur.get();
    if (snap.empty) break;
    await onBatch(snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
}

function tierOrder(t) {
  return t === 'Top Host' ? 3 : t === 'Connector' ? 2 : t === 'Rising' ? 1 : 0;
}

function dayKeysBackfill(days) {
  const now = new Date();
  const keys = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    keys.push(dayKeyFromDate(d));
  }
  return keys;
}

function computeScore(counts, cfg) {
  const joins = counts['join_event'] || 0;
  const rsvp = counts['rsvp_yes'] || 0;
  const shows = counts['check_in'] || 0;
  const engagement = (counts['save_event'] || 0) + (counts['share_event'] || 0);
  const reports = counts['report_content'] || 0;

  const rsvpShow = rsvp ? Math.min(1, shows / rsvp) : 0;
  const trust = Math.max(0, 1 - Math.min(1, reports / Math.max(1, joins)));

  const score =
    (cfg.wUniqueAttendees || 2.0) * Math.sqrt(Math.max(0, joins)) +
    (cfg.wRSVPShow || 1.5) * rsvpShow * 10 +
    (cfg.wEngagement || 1.2) * Math.log1p(Math.max(0, engagement)) +
    (cfg.wTrust || 2.0) * trust * 10;
  return Number.isFinite(score) ? score : 0;
}

const AGE_BUCKETS = Object.freeze([
  'under_18',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_plus',
  'unknown',
]);

const SEX_BUCKETS = Object.freeze([
  'female',
  'male',
  'non_binary',
  'prefer_not_say',
  'other',
  'unknown',
]);

function ageBracketForDob(dob, now = new Date()) {
  const d = toDate(dob);
  if (!d) return 'unknown';
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < 0 || age > 120) return 'unknown';
  if (age < 18) return 'under_18';
  if (age <= 24) return '18_24';
  if (age <= 34) return '25_34';
  if (age <= 44) return '35_44';
  if (age <= 54) return '45_54';
  return '55_plus';
}

function normalizeSexMetric(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return 'unknown';
  if (['female', 'f', 'woman'].includes(raw)) return 'female';
  if (['male', 'm', 'man'].includes(raw)) return 'male';
  if (['nonbinary', 'non-binary', 'non_binary', 'nb'].includes(raw))
    return 'non_binary';
  if (['prefer_not_say', 'prefer not to say'].includes(raw))
    return 'prefer_not_say';
  return 'other';
}

// ---------- Scheduled functions ----------
const computePopularity = onSchedule(
  {
    schedule: 'every day 02:30',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    logger.log('[computePopularity] starting');

    const cfgSnap = await db.collection('config').doc('popularity').get();
    const cfg = cfgSnap.exists
      ? cfgSnap.data()
      : {
          wUniqueAttendees: 2.0,
          wRSVPShow: 1.5,
          wEngagement: 1.2,
          wTrust: 2.0,
          thresholds: { Rising: 25, Connector: 60, TopHost: 120 },
          hysteresisBuffer: 5,
          lockDays: 30,
          graceDays: 7,
          windowDays: 28,
        };

    const dayKeys = dayKeysBackfill(cfg.windowDays || 28);

    const accum = new Map();
    for (const k of dayKeys) {
      const col = db
        .collection('analytics')
        .doc('daily')
        .collection(k)
        .collection('users');
      const snap = await col.get();
      if (snap.empty) continue;
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const uid = d.uid || doc.id;
        const cur = accum.get(uid) || {};
        const cnt = d.counts || {};
        for (const [name, val] of Object.entries(cnt)) {
          const n = typeof val === 'number' ? val : 0;
          cur[name] = (cur[name] || 0) + n;
        }
        accum.set(uid, cur);
      });
    }

    logger.log('[computePopularity] users in window:', accum.size);

    const batchWrites = [];
    let batch = db.batch();
    let batchCount = 0;
    const commitBatch = async () => {
      if (batchCount === 0) return;
      batchWrites.push(batch.commit());
      batch = db.batch();
      batchCount = 0;
    };

    const now = admin.firestore.Timestamp.now();
    const lockMillis = (cfg.lockDays || 30) * 864e5;
    const buffer = cfg.hysteresisBuffer || 5;
    const graceMillis = (cfg.graceDays || 7) * 864e5;

    for (const [uid, counts] of accum.entries()) {
      const score = computeScore(counts, cfg);

      let tier = 'None';
      if (score >= (cfg.thresholds?.TopHost || 120)) tier = 'Top Host';
      else if (score >= (cfg.thresholds?.Connector || 60)) tier = 'Connector';
      else if (score >= (cfg.thresholds?.Rising || 25)) tier = 'Rising';

      const pref = db.collection('popularity').doc(uid);
      const psnap = await pref.get();
      const prev = psnap.exists
        ? psnap.data()
        : {
            tier: 'None',
            lockedUntil: null,
            inGrace: false,
            graceStartedAt: null,
          };

      let finalTier = tier;
      let inGrace = false;
      let graceStartedAt = null;

      const lockedUntil = prev.lockedUntil;
      const locked = lockedUntil && lockedUntil.toMillis() > now.toMillis();

      if (locked && prev.tier && prev.tier !== 'None') {
        finalTier = prev.tier;
        inGrace = false;
        graceStartedAt = null;
      } else if (
        prev.tier &&
        prev.tier !== 'None' &&
        tierOrder(tier) < tierOrder(prev.tier)
      ) {
        const demoteThreshold = Math.max(
          0,
          (cfg.thresholds?.[prev.tier.replace(' ', '')] || 0) - buffer,
        );
        const wasInGrace = prev.inGrace === true;
        const prevStart = prev.graceStartedAt?.toMillis
          ? prev.graceStartedAt.toMillis()
          : null;
        const nowMs = now.toMillis();
        if (!wasInGrace) {
          inGrace = true;
          graceStartedAt = now;
          finalTier = prev.tier;
        } else {
          inGrace = true;
          graceStartedAt = prev.graceStartedAt || now;
          if (prevStart && nowMs - prevStart >= graceMillis) {
            finalTier = tier;
            inGrace = false;
            graceStartedAt = null;
          } else {
            finalTier = prev.tier;
          }
        }
        if (score >= demoteThreshold) {
          inGrace = false;
          graceStartedAt = null;
          finalTier = prev.tier;
        }
      } else {
        inGrace = false;
        graceStartedAt = null;
        if (tierOrder(tier) > tierOrder(prev.tier || 'None')) {
          const lockUntil = admin.firestore.Timestamp.fromMillis(
            now.toMillis() + lockMillis,
          );
          batch.update(pref, {
            lockedUntil: lockUntil,
          });
        }
      }

      const payload = {
        tier: finalTier,
        score,
        updatedAt: now,
        lockedUntil: prev.lockedUntil || null,
        inGrace,
        graceStartedAt: graceStartedAt || null,
      };
      batch.set(pref, payload, { merge: true });
      batchCount++;
      if (batchCount >= 400) await commitBatch();
    }

    await commitBatch();
    await Promise.all(batchWrites);
    logger.log('[computePopularity] finished');
  },
);

const rollupDailyAnalytics = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    const { start, end, key } = getYesterdayRangeUTC();
    logger.log(
      '[rollupDailyAnalytics] start',
      start.toISOString(),
      'end',
      end.toISOString(),
      'key',
      key,
    );

    const byEntity = new Map();
    const byEntityUids = new Map();
    const byInterest = new Map();
    const byInterestUids = new Map();
    const byUser = new Map();

    const startTs = admin.firestore.Timestamp.fromDate(start);
    const endTs = admin.firestore.Timestamp.fromDate(end);
    const base = db
      .collection('analytics_events')
      .where('createdAt', '>=', startTs)
      .where('createdAt', '<', endTs);

    await paginateQuery(base, async (docs) => {
      for (const d of docs) {
        const ev = d.data() || {};
        const name = String(ev.name || '').toLowerCase();
        if (!isAggregatableEvent(name)) continue;

        const payload = ev.payload || {};
        const uid = ev.uid || null;

        const entityIdRaw =
          payload.event_id || payload.card_id || payload.content_id || null;
        const entityId = entityIdRaw ? String(entityIdRaw) : null;

        const interestRaw = payload.interest || payload.category || null;
        const interestKey = safeKey(interestRaw);

        if (entityId) {
          const map = byEntity.get(entityId) || {};
          map[name] = (map[name] || 0) + 1;
          byEntity.set(entityId, map);
          if (uid) {
            let set = byEntityUids.get(entityId);
            if (!set) {
              set = new Set();
              byEntityUids.set(entityId, set);
            }
            set.add(uid);
          }
        }

        if (interestKey) {
          const map = byInterest.get(interestKey) || {};
          map[name] = (map[name] || 0) + 1;
          byInterest.set(interestKey, map);
          if (uid) {
            let set = byInterestUids.get(interestKey);
            if (!set) {
              set = new Set();
              byInterestUids.set(interestKey, set);
            }
            set.add(uid);
          }
        }

        if (uid) {
          const map = byUser.get(uid) || {};
          map[name] = (map[name] || 0) + 1;
          byUser.set(uid, map);
        }
      }
    });

    const dayRef = db.collection('analytics').doc('daily').collection(key);
    const batch = db.batch();

    for (const [entityId, counts] of byEntity.entries()) {
      const uniq = (byEntityUids.get(entityId) || new Set()).size;
      if (uniq < 3) continue;
      const ref = dayRef.doc(entityId);
      batch.set(
        ref,
        {
          day: key,
          entityId,
          counts,
          unique_users: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    for (const [interestKey, counts] of byInterest.entries()) {
      const uniq = (byInterestUids.get(interestKey) || new Set()).size;
      if (uniq < 5) continue;
      const ref = dayRef.doc(`interest_${interestKey}`);
      batch.set(
        ref,
        {
          day: key,
          interest: interestKey,
          counts,
          unique_users: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    for (const [uid, counts] of byUser.entries()) {
      const ref = dayRef.doc(`user_${uid}`);
      batch.set(
        ref,
        {
          day: key,
          uid,
          counts,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    await batch.commit();
    logger.log('[rollupDailyAnalytics] wrote rollups for', key, {
      entities: byEntity.size,
      interests: byInterest.size,
      users: byUser.size,
    });
  },
);

const sendEventReminders = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    logger.log('[sendEventReminders] starting');
    const now = new Date();
    const reminderStart = new Date(now.getTime() + 60 * 60 * 1000);
    const reminderEnd = new Date(now.getTime() + 75 * 60 * 1000);

    const eventsQuery = db
      .collection('events')
      .where('date', '>=', admin.firestore.Timestamp.fromDate(reminderStart))
      .where('date', '<=', admin.firestore.Timestamp.fromDate(reminderEnd))
      .where('isDeleted', '==', false);

    const eventsSnap = await eventsQuery.get();
    if (eventsSnap.empty) {
      logger.log('[sendEventReminders] No events found in reminder window');
      return;
    }

    logger.log(`[sendEventReminders] Found ${eventsSnap.size} events to remind`);

    for (const eventDoc of eventsSnap.docs) {
      const eventId = eventDoc.id;
      const event = eventDoc.data();

      const reminderCheckSnap = await db
        .collection('notifications')
        .where('eventId', '==', eventId)
        .where('type', '==', 'event_reminder')
        .limit(1)
        .get();

      if (!reminderCheckSnap.empty) {
        logger.log(`[sendEventReminders] Already sent reminder for ${eventId}`);
        continue;
      }

      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      const ownerId = event.ownerId;
      const notifRef = db.collection('notifications');
      const batch = db.batch();
      let batchCount = 0;
      const allRecipients = new Set([...attendees, ownerId].filter(Boolean));

      for (const recipientId of allRecipients) {
        const newNotifRef = notifRef.doc();
        batch.set(newNotifRef, {
          type: 'event_reminder',
          recipientId,
          eventId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          message: `${event.title || 'Your event'} starts in 1 hour!`,
          linkType: 'event',
          linkId: eventId,
          read: false,
        });
        batchCount++;
        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
        }
      }
      if (batchCount > 0) await batch.commit();
      logger.log(
        `[sendEventReminders] Sent ${allRecipients.size} reminders for event ${eventId}`,
      );
    }
    logger.log('[sendEventReminders] completed');
  },
);

const aggregateUsageMetrics = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'America/Los_Angeles',
    retryConfig: { retryCount: 3 },
  },
  async () => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totals = {
      totalUsers: 0,
      newUsers24h: 0,
      newUsers7d: 0,
      newUsers30d: 0,
      dau: 0,
      wau: 0,
      mau: 0,
      analyticsOptIn: 0,
    };

    const ageBuckets = {};
    for (const key of AGE_BUCKETS) ageBuckets[key] = 0;
    const sexBuckets = {};
    for (const key of SEX_BUCKETS) sexBuckets[key] = 0;

    const batchSize = 500;
    let lastDocId = null;

    while (true) {
      let query = db
        .collection('users')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(batchSize);
      if (lastDocId) query = query.startAfter(lastDocId);
      const snap = await query.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const data = doc.data() || {};
        totals.totalUsers += 1;
        if (data.analyticsOptIn === true) totals.analyticsOptIn += 1;

        const createdAt = toDate(data.createdAt);
        if (createdAt) {
          if (createdAt >= dayAgo) totals.newUsers24h += 1;
          if (createdAt >= weekAgo) totals.newUsers7d += 1;
          if (createdAt >= monthAgo) totals.newUsers30d += 1;
        }

        const lastActive = toDate(
          data.lastActiveAt || data.lastActive || data.updatedAt,
        );
        if (lastActive) {
          if (lastActive >= dayAgo) totals.dau += 1;
          if (lastActive >= weekAgo) totals.wau += 1;
          if (lastActive >= monthAgo) totals.mau += 1;
        }

        const ageBucket = ageBracketForDob(data.dob, now);
        incrementCounter(ageBuckets, ageBucket);
        const sexBucket = normalizeSexMetric(data.sex);
        incrementCounter(sexBuckets, sexBucket);
      }
      lastDocId = snap.docs[snap.docs.length - 1].id;
    }

    const optInRate =
      totals.totalUsers > 0
        ? Number((totals.analyticsOptIn / totals.totalUsers).toFixed(4))
        : 0;

    const summary = {
      computedAt: admin.firestore.Timestamp.now(),
      totals: {
        ...totals,
        analyticsOptInRate: optInRate,
      },
      windows: {
        dau: totals.dau,
        wau: totals.wau,
        mau: totals.mau,
        newUsers24h: totals.newUsers24h,
        newUsers7d: totals.newUsers7d,
        newUsers30d: totals.newUsers30d,
      },
      demographics: {
        age: ageBuckets,
        sex: sexBuckets,
      },
    };

    await db.collection('metrics').doc('usage').set(summary, { merge: true });
    logger.log('[aggregateUsageMetrics] updated usage metrics');
  },
);

module.exports = {
  computePopularity,
  rollupDailyAnalytics,
  sendEventReminders,
  aggregateUsageMetrics,
};

