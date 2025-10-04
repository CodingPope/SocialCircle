import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef, navigate } from './src/navigation/RootNavigation';
import { useUserStore } from './src/features/profile';
import { db } from './src/firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import AppNavigator from './src/navigation/AppNavigator';
import * as Notifications from 'expo-notifications';
import { initPushForUser, useNotificationStore } from './src/features/notifications';
import Constants from 'expo-constants';
import {
  initErrorReporting,
  setUserInErrorReporting,
} from './src/lib/errorReporting';
import {
  init as analyticsInit,
  setOptIn as analyticsSetOptIn,
  screen as analyticsScreen,
  event as analyticsEvent,
} from './src/services/analytics';

// Initialize error reporting once at module load to capture early errors
// Sentry temporarily disabled until __extends error is resolved
import LoadingOverlay from './src/components/ui/LoadingOverlay'; // Added LoadingOverlay import
import AnalyticsConsentPrompt from './src/components/analytics/AnalyticsConsentPrompt';
import { recordDailySessionHeartbeat } from './src/services/sessionHeartbeat';
import {
  handleIncomingLink,
  shouldEnableDeepLinking,
} from './src/services/deepLinking';
console.log('Sentry initialization disabled - troubleshooting __extends error');

function AppContent() {
  // Description: Get user from Zustand store
  const user = useUserStore((state) => state.user);
  const storeLoading = useUserStore((state) => state.loading);
  const setUser = useUserStore((state) => state.setUser);
  const [profileComplete, setProfileComplete] = useState(false);
  const [checking, setChecking] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(null);
  const [showAnalyticsPrompt, setShowAnalyticsPrompt] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  // Import onboarding router utility
  const { getNextOnboardingStep } = require('./src/utils/onboardingRouter');

  const subscribeNotifications = useNotificationStore((s) => s.subscribe);
  const clearNotifications = useNotificationStore((s) => s.unsubscribe);

  // Tag Sentry and initialize analytics with privacy flag when user changes
  useEffect(() => {
    try {
      setUserInErrorReporting(user);
    } catch {}
    // Initialize analytics respecting opt-in; turn off when signed out
    (async () => {
      try {
        if (user && user.uid) {
          await analyticsInit(user);
        } else {
          await analyticsSetOptIn(false);
        }
      } catch {}
    })();
  }, [user?.uid, user?.analyticsOptIn]);

  // NEW: Start auth listener once on mount (since AuthProvider is not used)
  useEffect(() => {
    try {
      const listen = useUserStore.getState().listenAuthState;
      if (typeof listen === 'function') listen();
    } catch {}
  }, []);

  // NEW: Register a notification response listener (must be before any early return)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (resp) => {
        const data = resp?.notification?.request?.content?.data || {};
        // Deep link routing: prefer chat if eventId + chat
        try {
          if (data.eventId && data.linkType === 'chat') {
            navigate('EventChat', { eventId: data.eventId });
          } else if (data.eventId) {
            navigate('EventDetail', { eventId: data.eventId });
          } else if (data.linkType && data.linkId) {
            navigate(data.linkType, { id: data.linkId });
          }
        } catch {}
      }
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!shouldEnableDeepLinking()) return;

    const handleLink = (payload) => {
      const url = typeof payload === 'string' ? payload : payload?.url;
      if (url) handleIncomingLink(url);
    };

    let unsubscribeDynamic = null;
    let linkingSub = null;
    let mounted = true;

    (async () => {
      let dynamicLinksModule = null;
      try {
        dynamicLinksModule =
          require('@react-native-firebase/dynamic-links').default;
      } catch (err) {
        console.warn(
          '[deep-link] Dynamic Links module unavailable',
          err?.message || err
        );
        return;
      }

      if (!mounted || typeof dynamicLinksModule !== 'function') return;

      const instance = dynamicLinksModule();
      try {
        const initial = await instance.getInitialLink();
        if (mounted && initial?.url) handleLink(initial.url);
      } catch {}

      unsubscribeDynamic = instance.onLink((link) => handleLink(link?.url));
      linkingSub = Linking.addEventListener('url', ({ url }) =>
        handleLink(url)
      );
    })();

    return () => {
      mounted = false;
      try {
        unsubscribeDynamic?.();
      } catch {}
      linkingSub?.remove?.();
    };
  }, []);

  // NEW: Initialize push token once per session after login (per-uid guard)
  const initializedPushRef = useRef(new Set());
  useEffect(() => {
    if (user?.uid && !initializedPushRef.current.has(user.uid)) {
      initializedPushRef.current.add(user.uid);
      (async () => {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            await initPushForUser(user.uid);
          }
        } catch {}
      })();
    }
  }, [user?.uid]);

  useEffect(() => {
    const check = async () => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const nextStep = getNextOnboardingStep(data);
          setOnboardingStep(nextStep);
          setProfileComplete(!nextStep);
        } else {
          setProfileComplete(false);
          setOnboardingStep('NameDob');
        }
      }
      setChecking(false);
    };
    check();
  }, [user]);

  useEffect(() => {
    if (!user?.uid) {
      setShowAnalyticsPrompt(false);
      return;
    }
    const hasDecision = typeof user?.analyticsOptIn === 'boolean';
    const alreadyPrompted = !!user?.analyticsPromptedAt;
    if (!hasDecision && !alreadyPrompted) {
      setShowAnalyticsPrompt(true);
    } else {
      setShowAnalyticsPrompt(false);
    }
  }, [user?.uid, user?.analyticsOptIn, user?.analyticsPromptedAt]);

  useEffect(() => {
    if (!user?.uid) {
      clearNotifications();
      return;
    }
    const unsub = subscribeNotifications(user.uid);
    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [user?.uid, subscribeNotifications, clearNotifications]);

  const persistAnalyticsChoice = useCallback(
    async (accepted) => {
      if (!user?.uid) return;
      setConsentBusy(true);
      const timestamp = serverTimestamp();
      const acceptedFlag = !!accepted;
      const localTimestamp = new Date();
      let writeSucceeded = false;
      try {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            analyticsOptIn: acceptedFlag,
            analyticsUpdatedAt: timestamp,
            analyticsPromptedAt: timestamp,
            analyticsConsentVersion: 1,
          },
          { merge: true }
        );
        writeSucceeded = true;
      } catch (err) {
        if (err?.code === 'permission-denied') {
          try {
            await setDoc(
              doc(db, 'users', user.uid),
              {
                type: 'user',
                email: user.email || '',
                premiumActive: false,
                isPopular: false,
                status: 'active',
                verified: false,
                isDeleted: false,
                deletedAt: null,
                analyticsOptIn: acceptedFlag,
                analyticsUpdatedAt: timestamp,
                analyticsPromptedAt: timestamp,
                analyticsConsentVersion: 1,
              },
              { merge: true }
            );
            writeSucceeded = true;
          } catch (fallbackErr) {
            console.error(
              'Failed to persist analytics consent after fallback',
              fallbackErr
            );
            throw fallbackErr;
          }
        } else {
          console.error('Failed to persist analytics consent', err);
          throw err;
        }
      } finally {
        setConsentBusy(false);
        setShowAnalyticsPrompt(false);
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
          console.warn('Failed to update local user store with consent', err);
        }
      }

      try {
        await analyticsSetOptIn(acceptedFlag);
        await analyticsInit({
          optedIn: acceptedFlag,
          uid: user.uid,
          props: {
            plan: user?.plan || 'free',
            interests_count: String(user?.interests?.length || 0),
          },
        });
        await analyticsEvent('analytics_consent', {
          status: acceptedFlag ? 'accepted' : 'declined',
        });
      } catch {}
    },
    [setUser, user]
  );

  const showLoadingOverlay = storeLoading || checking;

  useEffect(() => {
    if (user?.uid) {
      recordDailySessionHeartbeat(user);
    }
  }, [user?.uid]);

  useEffect(() => {
    const handleAppStateChange = (nextState) => {
      if (nextState === 'active' && user?.uid) {
        recordDailySessionHeartbeat(user);
      }
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );
    return () => subscription.remove();
  }, [user?.uid]);

  const navigator =
    user && onboardingStep ? (
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          try {
            const rn = navigationRef.current?.getCurrentRoute()?.name;
            navigationRef.routeNameRef = rn;
            if (rn) analyticsScreen(rn);
          } catch {}
        }}
        onStateChange={async () => {
          try {
            const prev = navigationRef.routeNameRef;
            const curr = navigationRef.current?.getCurrentRoute()?.name;
            if (curr && curr !== prev) await analyticsScreen(curr);
            navigationRef.routeNameRef = curr;
          } catch {}
        }}
      >
        <AppNavigator
          user={user}
          profileComplete={false}
          initialOnboardingStep={onboardingStep}
        />
      </NavigationContainer>
    ) : (
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          try {
            const rn = navigationRef.current?.getCurrentRoute()?.name;
            navigationRef.routeNameRef = rn;
            if (rn) analyticsScreen(rn);
          } catch {}
        }}
        onStateChange={async () => {
          try {
            const prev = navigationRef.routeNameRef;
            const curr = navigationRef.current?.getCurrentRoute()?.name;
            if (curr && curr !== prev) await analyticsScreen(curr);
            navigationRef.routeNameRef = curr;
          } catch {}
        }}
      >
        <AppNavigator user={user} profileComplete={profileComplete} />
      </NavigationContainer>
    );

  return (
    <>
      {navigator}
      <LoadingOverlay visible={showLoadingOverlay} />
      <AnalyticsConsentPrompt
        visible={showAnalyticsPrompt}
        busy={consentBusy}
        onAccept={() => persistAnalyticsChoice(true)}
        onDecline={() => persistAnalyticsChoice(false)}
      />
    </>
  );
}

export default function App() {
  // Description: No longer wrap with AuthProvider
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppContent />
    </GestureHandlerRootView>
  );
}
