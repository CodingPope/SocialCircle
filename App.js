import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { navigationRef, navigate } from './src/navigation/RootNavigation';
import { useUserStore } from './src/features/profile';
import { db, serverTimestamp } from './src/firebase/config';
import AppNavigator from './src/navigation/AppNavigator';
import * as Notifications from 'expo-notifications';
import {
  initPushForUser,
  useNotificationStore,
} from './src/features/notifications';
import Constants from 'expo-constants';
import {
  initErrorReporting,
  setUserInErrorReporting,
} from './src/lib/errorReporting';
import {
  init as analyticsInit,
  analyticsInit as configureAnalytics,
  setOptIn as analyticsSetOptIn,
  screen as analyticsScreen,
  event as analyticsEvent,
  deriveUserAnalyticsProps,
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
import { ThemeProvider, lightTheme, darkTheme } from './src/theme';
import { useThemeStore } from './src/store/themeStore';
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
  const themeMode = useThemeStore((state) => state.mode);
  // Import onboarding router utility
  const { getNextOnboardingStep } = require('./src/utils/onboardingRouter');

  // Create navigation theme based on current theme mode
  const navigationTheme = useMemo(() => {
    if (themeMode === 'dark') {
      return {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: darkTheme.colors.primary,
          background: darkTheme.colors.background,
          card: darkTheme.colors.card,
          text: darkTheme.colors.text,
          border: darkTheme.colors.border,
          notification: darkTheme.colors.primary,
        },
      };
    }
    return {
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        primary: lightTheme.colors.primary,
        background: lightTheme.colors.background,
        card: lightTheme.colors.card,
        text: lightTheme.colors.text,
        border: lightTheme.colors.border,
        notification: lightTheme.colors.primary,
      },
    };
  }, [themeMode]);

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
        // Deep link routing with proper screen targeting
        try {
          if (data.linkType === 'chat' && data.eventId) {
            // Navigate to event chat for chat messages
            navigate('EventChat', { eventId: data.eventId });
          } else if (data.linkType === 'event' && data.eventId) {
            // Navigate to event details for other event notifications
            navigate('EventDetail', { eventId: data.eventId });
          } else if (data.eventId && data.linkType === 'chat') {
            // Fallback for older chat notifications
            navigate('EventChat', { eventId: data.eventId });
          } else if (data.eventId) {
            // Default to event detail
            navigate('EventDetail', { eventId: data.eventId });
          } else if (data.linkType && data.linkId) {
            // Generic navigation
            navigate(data.linkType, { id: data.linkId });
          }
        } catch (err) {
          console.error('[notification-handler] navigation error:', err);
        }
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
          const userDocRef = db.collection('users').doc(user.uid);
          const snap = await userDocRef.get();
          if (snap.exists) {
            await initPushForUser(user.uid);
          }
        } catch {}
      })();
    }
  }, [user?.uid]);

  useEffect(() => {
    const check = async () => {
      if (user) {
        const userDocRef = db.collection('users').doc(user.uid);
        const snap = await userDocRef.get();
        if (snap.exists) {
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
          { merge: true }
        );
        writeSucceeded = true;
      } catch (err) {
        if (err?.code === 'permission-denied') {
          try {
            await userDocRef.set(
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
    [setUser, user]
  );

  const showLoadingOverlay = storeLoading || checking;

  useEffect(() => {
    if (user?.uid && user?.analyticsOptIn) {
      recordDailySessionHeartbeat(user);
    }
  }, [user?.uid, user?.analyticsOptIn]);

  useEffect(() => {
    const handleAppStateChange = (nextState) => {
      if (nextState === 'active' && user?.uid && user?.analyticsOptIn) {
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
        theme={navigationTheme}
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
        theme={navigationTheme}
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
  // Description: Get theme mode from store and pass to ThemeProvider
  const themeMode = useThemeStore((state) => state.mode);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider mode={themeMode}>
        <AppContent />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
