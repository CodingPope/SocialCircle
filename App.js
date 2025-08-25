import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/navigation/RootNavigation';
import { useUserStore } from './src/features/profile/userStore';
import { db } from './src/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
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
try {
  const envDsn =
    typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_SENTRY_DSN : '';
  const expoCfg = Constants?.expoConfig || {};
  const dsn = envDsn || expoCfg?.extra?.sentryDsn || '';
  const environment =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SENTRY_ENV) ||
    expoCfg?.extra?.sentryEnv ||
    (__DEV__ ? 'development' : 'beta');
  const bundleId = expoCfg?.ios?.bundleIdentifier || 'com.socialcirclellc.app';
  const version = expoCfg?.version || '1.0.0';
  const buildNumber = expoCfg?.ios?.buildNumber || version;
  const release = `${bundleId}@${version}+${buildNumber}`;
  initErrorReporting({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
    environment,
    release,
  });
} catch {}

function AppContent() {
  // Description: Get user from Zustand store
  const user = useUserStore((state) => state.user);
  const [profileComplete, setProfileComplete] = useState(false);
  const [checking, setChecking] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(null);
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

  if (checking) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  // If user is not onboarded, route to correct onboarding step
  if (user && onboardingStep) {
    return (
      <NavigationContainer ref={navigationRef}>
        <AppNavigator
          user={user}
          profileComplete={false}
          initialOnboardingStep={onboardingStep}
        />
      </NavigationContainer>
    );
  }

  // If profile is complete, show main app
  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator user={user} profileComplete={profileComplete} />
    </NavigationContainer>
  );
}

export default function App() {
  // Description: No longer wrap with AuthProvider
  return <AppContent />;
}
