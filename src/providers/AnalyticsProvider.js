import React, { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { db, serverTimestamp } from '../services/firebase';
import {
  init as analyticsInit,
  analyticsInit as configureAnalytics,
  setOptIn as analyticsSetOptIn,
  event as analyticsEvent,
  deriveUserAnalyticsProps,
  setTrackingAllowed,
} from '../services/analyticsService';
import { setUserInErrorReporting } from '../lib/errorReporting';
import useTrackingPermission from '../hooks/useTrackingPermission';
import logger from '../lib/logger';

export default function AnalyticsProvider({
  user,
  sessionRole,
  setUser,
  children,
}) {
  const isBusinessSession = sessionRole === 'business';
  const { requestPermission, status: attStatus, canPrompt } =
    useTrackingPermission();

  // Tag Sentry and initialize analytics with privacy flag when user changes
  useEffect(() => {
    try {
      setUserInErrorReporting(user);
    } catch {}
    (async () => {
      try {
        const attAllowed =
          Platform.OS !== 'ios' ? true : attStatus === 'granted';
        setTrackingAllowed(attAllowed);

        if (user && user.uid) {
          const allowAnalytics = user.analyticsOptIn === true && attAllowed;
          await analyticsInit({
            ...user,
            analyticsOptIn: allowAnalytics,
          });
        } else {
          await analyticsSetOptIn(false);
        }
      } catch {}
    })();
  }, [user?.uid, user?.analyticsOptIn, attStatus]);

  // If user opted into analytics but ATT hasn't been shown yet, trigger native prompt before tracking
  useEffect(() => {
    if (
      Platform.OS === 'ios' &&
      user?.analyticsOptIn &&
      attStatus === 'undetermined' &&
      canPrompt
    ) {
      requestPermission().catch(() => {});
    }
  }, [user?.analyticsOptIn, attStatus, canPrompt, requestPermission]);

  // Persist analytics choice and prompt ATT when needed
  const persistAnalyticsChoice = useCallback(
    async (accepted) => {
      if (!user?.uid || isBusinessSession) return;

      const userDocRef = db.collection('users').doc(user.uid);
      const timestamp = serverTimestamp();
      const acceptedFlag = !!accepted;
      const localTimestamp = new Date();
      let writeSucceeded = false;
      try {
        await userDocRef.set(
          {
            analyticsOptIn: acceptedFlag,
            analyticsUpdatedAt: timestamp,
            analyticsPromptedAt: timestamp,
            analyticsConsentVersion: 1,
          },
          { merge: true },
        );
        writeSucceeded = true;
      } catch (err) {
        if (err?.code === 'permission-denied') {
          try {
            await userDocRef.set(
              {
                analyticsOptIn: acceptedFlag,
                analyticsUpdatedAt: timestamp,
                analyticsPromptedAt: timestamp,
                analyticsConsentVersion: 1,
              },
              { merge: true },
            );
            writeSucceeded = true;
          } catch (fallbackErr) {
            logger.warn(
              'Failed to persist analytics consent (non-blocking)',
              fallbackErr?.code || fallbackErr,
            );
            writeSucceeded = true;
          }
        } else {
          logger.error('Failed to persist analytics consent', err);
          writeSucceeded = true;
        }
      }

      if (!writeSucceeded) return;

      if (typeof setUser === 'function') {
        try {
          setUser({
            ...user,
            analyticsOptIn: acceptedFlag,
            analyticsConsentVersion: 1,
            analyticsPromptedAt: localTimestamp,
            analyticsUpdatedAt: localTimestamp,
          });
        } catch (err) {
          logger.warn('Failed to update local user store with consent', err);
        }
      }

      try {
        await analyticsSetOptIn(acceptedFlag);
        await configureAnalytics({
          optedIn: acceptedFlag,
          uid: user.uid,
          props: deriveUserAnalyticsProps({
            ...user,
            analyticsOptIn: acceptedFlag,
          }),
        });
        await analyticsEvent('analytics_consent', {
          status: acceptedFlag ? 'accepted' : 'declined',
        });
      } catch {}
    },
    [setUser, user, isBusinessSession],
  );

  useEffect(() => {
    if (!user?.uid || isBusinessSession) return;

    const hasDecision = typeof user?.analyticsOptIn === 'boolean';
    const alreadyPrompted = !!user?.analyticsPromptedAt;

    if (!hasDecision && !alreadyPrompted && canPrompt) {
      (async () => {
        try {
          const result = await requestPermission();
          const granted = result?.granted || false;
          await persistAnalyticsChoice(granted);
        } catch (error) {
          logger.error('[ATT] Failed to request permission:', error);
          await persistAnalyticsChoice(false);
        }
      })();
    } else if (!hasDecision && !alreadyPrompted && attStatus === 'granted') {
      persistAnalyticsChoice(true);
    } else if (
      !hasDecision &&
      !alreadyPrompted &&
      (attStatus === 'denied' || attStatus === 'restricted')
    ) {
      persistAnalyticsChoice(false);
    }
  }, [
    user?.uid,
    user?.analyticsOptIn,
    user?.analyticsPromptedAt,
    isBusinessSession,
    canPrompt,
    attStatus,
    requestPermission,
    persistAnalyticsChoice,
  ]);

  return children;
}
