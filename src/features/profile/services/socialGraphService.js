import {
  db,
  arrayUnion,
  arrayRemove,
  sendNotification,
  reportContent,
  functions,
} from '../../../firebase/config';
import logger from '../../../utils/logger';

const RETRY_DELAYS_MS = [0, 250, 1000];
const RETRYABLE_CODES = new Set([
  'aborted',
  'cancelled',
  'deadline-exceeded',
  'internal',
  'resource-exhausted',
  'unavailable',
]);
const RETRYABLE_MESSAGE_SNIPPETS = [
  'timeout',
  'timed out',
  'network request failed',
  'unable to resolve host',
  'socket',
  '503',
  'try again later',
];
const ACTION_LABELS = {
  follow: 'follow user',
  unfollow: 'unfollow user',
  block: 'block user',
  unblock: 'unblock user',
  report: 'report content',
};

const inFlightRequests = new Map();

const wait = (ms) =>
  ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

const normalizeErrorCode = (error) => {
  if (!error || !error.code) return 'unknown';
  let code = String(error.code).toLowerCase();
  if (code.includes('/')) {
    const segments = code.split('/');
    code = segments[segments.length - 1];
  }
  return code;
};

const isRetryableError = (error) => {
  const code = normalizeErrorCode(error);
  if (RETRYABLE_CODES.has(code)) return true;
  const message = String(error?.message || '').toLowerCase();
  return RETRYABLE_MESSAGE_SNIPPETS.some((snippet) =>
    message.includes(snippet)
  );
};

const resolveFriendlyMessage = (action, code, fallback) => {
  if (code === 'unauthenticated') return 'Please sign in to continue.';
  if (code === 'permission-denied')
    return 'You are not allowed to perform this action.';
  if (code === 'not-found')
    return 'Account unavailable. Refresh and try again.';
  if (code === 'invalid-argument')
    return 'This action is missing required information.';
  return (
    fallback ||
    `Unable to ${ACTION_LABELS[action] || action}. Please try again.`
  );
};

const createRelationshipError = (action, error) => {
  const code = normalizeErrorCode(error);
  const err = new Error(
    resolveFriendlyMessage(action, code, String(error?.message || '').trim())
  );
  err.name = 'SocialGraphServiceError';
  err.code = code;
  err.action = action;
  err.cause = error;
  return err;
};

const withRetry = async (action, fn) => {
  let lastError = null;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await wait(RETRY_DELAYS_MS[attempt]);
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const willRetry =
        attempt < RETRY_DELAYS_MS.length - 1 && isRetryableError(error);
      logger.warn(
        `[SocialGraph] ${action} attempt ${attempt + 1} failed${
          willRetry ? ', retrying' : ''
        }:`,
        error?.message || error
      );
      if (!willRetry) break;
    }
  }
  throw createRelationshipError(action, lastError);
};

const guardInFlight = (key, factory) => {
  if (!key) return factory();
  if (inFlightRequests.has(key)) return inFlightRequests.get(key);
  const guardedPromise = (async () => {
    try {
      return await factory();
    } finally {
      inFlightRequests.delete(key);
    }
  })();
  inFlightRequests.set(key, guardedPromise);
  return guardedPromise;
};

const getUserDoc = async (uid) => {
  const ref = db.collection('users').doc(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    const error = new Error('User not found');
    error.code = 'not-found';
    throw error;
  }
  return { ref, data: snapshot.data() };
};

const fireAndForget = (label, task) => {
  try {
    const maybePromise = task();
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.catch((error) => {
        logger.warn(`[SocialGraph] ${label} failed:`, error?.message || error);
      });
    }
  } catch (error) {
    logger.warn(`[SocialGraph] ${label} threw:`, error?.message || error);
  }
};

const callCallable = async (action, name, payload = {}) =>
  withRetry(action, async () => {
    const callable = functions.httpsCallable(name);
    const response = await callable(payload);
    return response?.data ?? response;
  });

export const followUserRelationship = async ({
  actorUid,
  targetUid,
  notification,
} = {}) => {
  if (!actorUid || !targetUid) {
    const error = new Error('Missing user identifiers');
    error.code = 'invalid-argument';
    throw createRelationshipError('follow', error);
  }
  if (actorUid === targetUid) {
    return { ok: false, status: 'self-follow' };
  }
  const key = `follow:${actorUid}:${targetUid}`;
  return guardInFlight(key, () =>
    withRetry('follow', async () => {
      const { ref, data } = await getUserDoc(actorUid);
      const following = Array.isArray(data.following) ? data.following : [];
      if (following.includes(targetUid)) {
        return { ok: true, status: 'already-following' };
      }
      await ref.update({ following: arrayUnion(targetUid) });
      if (notification?.type) {
        fireAndForget('sendNotification', () =>
          sendNotification(
            notification.type,
            targetUid,
            notification.data || {}
          )
        );
      }
      return { ok: true, status: 'followed' };
    })
  );
};

export const unfollowUserRelationship = async ({
  actorUid,
  targetUid,
} = {}) => {
  if (!actorUid || !targetUid) {
    const error = new Error('Missing user identifiers');
    error.code = 'invalid-argument';
    throw createRelationshipError('unfollow', error);
  }
  if (actorUid === targetUid) {
    return { ok: false, status: 'self-unfollow' };
  }
  const key = `unfollow:${actorUid}:${targetUid}`;
  return guardInFlight(key, () =>
    withRetry('unfollow', async () => {
      const { ref, data } = await getUserDoc(actorUid);
      const following = Array.isArray(data.following) ? data.following : [];
      if (!following.includes(targetUid)) {
        return { ok: true, status: 'already-unfollowed' };
      }
      await ref.update({ following: arrayRemove(targetUid) });
      return { ok: true, status: 'unfollowed' };
    })
  );
};

export const blockUserRelationship = async ({ targetUid } = {}) => {
  if (!targetUid) {
    const error = new Error('Missing target user');
    error.code = 'invalid-argument';
    throw createRelationshipError('block', error);
  }
  return guardInFlight(`block:${targetUid}`, () =>
    callCallable('block', 'blockUser', { targetUid }).then(() => ({
      ok: true,
      status: 'blocked',
    }))
  );
};

export const unblockUserRelationship = async ({ targetUid } = {}) => {
  if (!targetUid) {
    const error = new Error('Missing target user');
    error.code = 'invalid-argument';
    throw createRelationshipError('unblock', error);
  }
  return guardInFlight(`unblock:${targetUid}`, () =>
    callCallable('unblock', 'unblockUser', { targetUid }).then(() => ({
      ok: true,
      status: 'unblocked',
    }))
  );
};

export const reportUserContent = async ({
  reporterUid,
  targetUid,
  type,
  reason,
  options,
} = {}) => {
  if (!targetUid || !type) {
    const error = new Error('Missing report target or type');
    error.code = 'invalid-argument';
    throw createRelationshipError('report', error);
  }
  const data = await withRetry('report', () =>
    reportContent(reporterUid, targetUid, type, reason, options)
  );
  return { ok: true, data };
};
