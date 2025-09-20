import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/navigation/RootNavigation';
import { useUserStore } from './src/features/profile/userStore';
import { db } from './src/firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AppNavigator from './src/navigation/AppNavigator';
import * as Notifications from 'expo-notifications';
import { initPushForUser } from './src/features/notifications/services/pushService';
import Constants from 'expo-constants';
import {
  initErrorReporting,
  setUserInErrorReporting,
} from './src/lib/errorReporting';
import {
  init as analyticsInit,
  setOptIn as analyticsSetOptIn,
} from './src/services/analytics';

// Initialize error reporting once at module load to capture early errors
// Sentry temporarily disabled until __extends error is resolved
import LoadingOverlay from './src/components/ui/LoadingOverlay'; // Added LoadingOverlay import
import AnalyticsConsentPrompt from './src/components/analytics/AnalyticsConsentPrompt';
import { recordDailySessionHeartbeat } from './src/services/sessionHeartbeat';
console.log('Sentry initialization disabled - troubleshooting __extends error');

function AppContent() {
  // Description: Get user from Zustand store
  const user = useUserStore((state) => state.user);
  const storeLoading = useUserStore((state) => state.loading);
  const [profileComplete, setProfileComplete] = useState(false);
  const [checking, setChecking] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(null);
  const [showAnalyticsPrompt, setShowAnalyticsPrompt] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  // Import onboarding router utility
  const { getNextOnboardingStep } = require('./src/utils/onboardingRouter');

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

  const persistAnalyticsChoice = useCallback(
    async (accepted) => {
      if (!user?.uid) return;
      setConsentBusy(true);
      const now = new Date();
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          analyticsOptIn: !!accepted,
          analyticsUpdatedAt: now,
          analyticsPromptedAt: now,
          analyticsConsentVersion: 1,
        });
      } catch (err) {
        console.error('Failed to persist analytics consent', err);
      } finally {
        setConsentBusy(false);
        setShowAnalyticsPrompt(false);
      }
      try {
        await analyticsSetOptIn(!!accepted);
      } catch {}
    },
    [user?.uid]
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
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [user?.uid]);

  const navigator = user && onboardingStep ? (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator
        user={user}
        profileComplete={false}
        initialOnboardingStep={onboardingStep}
      />
    </NavigationContainer>
  ) : (
    <NavigationContainer ref={navigationRef}>
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
