import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { navigationRef, navigate } from './src/navigation/RootNavigation';
import { useUserStore, useSessionRole } from './src/features/profile';
import { db, serverTimestamp } from './src/services/firebase/config';
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
} from './src/services/analyticsService';
import { AuthProvider } from './src/features/auth/context/AuthContext';

// Initialize error reporting once at module load to capture early errors
// Sentry temporarily disabled until __extends error is resolved
import LoadingOverlay from './src/components/ui/LoadingOverlay'; // Added LoadingOverlay import
import { recordDailySessionHeartbeat } from './src/services/sessionHeartbeatService';
import {
  handleIncomingLink,
  shouldEnableDeepLinking,
} from './src/services/deepLinkingService';
import { ThemeProvider, lightTheme, darkTheme } from './src/theme';
import { useThemeStore } from './src/store/themeStore';
import ErrorBoundary from './src/components/ErrorBoundary';
import useTrackingPermission from './src/hooks/useTrackingPermission';
import logger from './src/lib/logger';

// Description: Keep splash screen visible while app loads
SplashScreen.preventAutoHideAsync().catch((err) => {
  console.error('[App] Failed to prevent auto hide splash:', err);
});
console.log('[App] Initializing Social Circle app');
console.log('Sentry initialization disabled - troubleshooting __extends error');

function AppContent() {
  console.log('[AppContent] Component rendering');

  // Description: Get user from Zustand store
  const user = useUserStore((state) => state.user);
  const storeLoading = useUserStore((state) => state.loading);
  const setUser = useUserStore((state) => state.setUser);
  const sessionRole = useSessionRole((state) => state.role);
  const isBusinessSession = sessionRole === 'business';
  const [profileComplete, setProfileComplete] = useState(false);
  const [checking, setChecking] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const themeMode = useThemeStore((state) => state.mode);

  // Description: Use native iOS App Tracking Transparency (ATT) instead of custom prompt
  const {
    requestPermission,
    status: attStatus,
    canPrompt,
  } = useTrackingPermission();

  console.log('[AppContent] State:', {
    storeLoading,
    checking,
    appReady,
    hasUser: !!user,
  });

  // Import onboarding router utility
  const {
    getNextOnboardingStep,
  } = require('./src/features/auth/utils/onboardingRouter');

  // Description: Safety timeout - force hide splash screen after 10 seconds if stuck
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!appReady) {
        console.warn(
          '[AppContent] Timeout reached without app ready. Force hiding splash screen.'
        );
        console.warn('[AppContent] Debug state:', {
          storeLoading,
          checking,
          appReady,
          hasUser: !!user,
        });
        SplashScreen.hideAsync().catch(() => {});
        // Force set states to unblock
        setChecking(false);
        setAppReady(true);
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeout);
  }, [appReady, storeLoading, checking, user]);

  // Description: Hide splash screen once app is ready
  useEffect(() => {
    console.log('[AppContent] Splash screen check:', {
      storeLoading,
      checking,
      appReady,
      shouldHide: !storeLoading && !checking && appReady,
    });
    if (!storeLoading && !checking && appReady) {
      const hideSplash = async () => {
        try {
          console.log('[AppContent] Hiding splash screen');
          await SplashScreen.hideAsync();
          console.log('[AppContent] Splash screen hidden successfully');
        } catch (err) {
          console.log('[AppContent] Splash already hidden or error:', err);
        }
      };
      // Small delay to ensure smooth transition
      setTimeout(hideSplash, 100);
    }
  }, [storeLoading, checking, appReady]);

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
    console.log('[AppContent] Setting up auth listener');
    try {
      const listen = useUserStore.getState().listenAuthState;
      if (typeof listen === 'function') {
        console.log('[AppContent] Calling listenAuthState');
        listen();
      } else {
        console.error(
          '[AppContent] listenAuthState is not a function:',
          typeof listen
        );
      }
    } catch (err) {
      console.error('[AppContent] Failed to start auth listener:', err);
    }
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
    console.log('[AppContent] Checking user profile. User UID:', user?.uid);
    const check = async () => {
      if (user) {
        console.log('[AppContent] User exists, fetching profile data');
        try {
          const userDocRef = db.collection('users').doc(user.uid);
          const snap = await userDocRef.get();
          console.log('[AppContent] User doc exists:', snap.exists);
          if (snap.exists) {
            const data = snap.data();
            const nextStep = getNextOnboardingStep(data);
            console.log('[AppContent] Next onboarding step:', nextStep);
            setOnboardingStep(nextStep);
            setProfileComplete(!nextStep);
          } else {
            console.log(
              '[AppContent] User doc does not exist, setting onboarding to NameDob'
            );
            setProfileComplete(false);
            setOnboardingStep('NameDob');
          }
        } catch (err) {
          console.error('[AppContent] Error fetching user profile:', err);
          setProfileComplete(false);
          setOnboardingStep('NameDob');
        }
      } else {
        console.log('[AppContent] No user, skipping profile check');
      }
      console.log('[AppContent] Setting checking to false');
      setChecking(false);
    };
    check();
  }, [user]);

  // Description: Persist analytics choice to Firestore and update local state
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
    [setUser, user, isBusinessSession]
  );

  // Description: Request App Tracking Transparency permission for iOS (Guideline 5.1.2)
  // This replaces the custom analytics consent modal with Apple's native ATT prompt
  useEffect(() => {
    if (!user?.uid || isBusinessSession) return;

    // Only request ATT if:
    // 1. User hasn't made a decision yet (analyticsOptIn is undefined/null)
    // 2. User hasn't been prompted before (analyticsPromptedAt is missing)
    // 3. ATT status is 'undetermined' (native prompt not shown yet)
    const hasDecision = typeof user?.analyticsOptIn === 'boolean';
    const alreadyPrompted = !!user?.analyticsPromptedAt;

    if (!hasDecision && !alreadyPrompted && canPrompt) {
      // Request ATT permission (shows native iOS prompt)
      (async () => {
        try {
          const result = await requestPermission();
          const granted = result?.granted || false;

          // Persist the user's choice to Firestore
          await persistAnalyticsChoice(granted);
        } catch (error) {
          logger.error('[ATT] Failed to request permission:', error);
          // On error, default to declined
          await persistAnalyticsChoice(false);
        }
      })();
    } else if (!hasDecision && !alreadyPrompted && attStatus === 'granted') {
      // ATT already granted (edge case: user granted in system settings before app asked)
      persistAnalyticsChoice(true);
    } else if (
      !hasDecision &&
      !alreadyPrompted &&
      (attStatus === 'denied' || attStatus === 'restricted')
    ) {
      // ATT already denied/restricted
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

  const showLoadingOverlay = storeLoading || checking;

  console.log('[AppContent] Render state:', {
    showLoadingOverlay,
    storeLoading,
    checking,
    appReady,
    hasUser: !!user,
    profileComplete,
    onboardingStep,
  });

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
          console.log('[NavigationContainer] onReady called (with onboarding)');
          try {
            const rn = navigationRef.current?.getCurrentRoute()?.name;
            navigationRef.routeNameRef = rn;
            console.log('[NavigationContainer] Current route:', rn);
            if (rn) analyticsScreen(rn);
            console.log('[NavigationContainer] Setting appReady to true');
            setAppReady(true);
          } catch (err) {
            console.error('[NavigationContainer] Error in onReady:', err);
          }
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
          console.log('[NavigationContainer] onReady called (normal flow)');
          try {
            const rn = navigationRef.current?.getCurrentRoute()?.name;
            navigationRef.routeNameRef = rn;
            console.log('[NavigationContainer] Current route:', rn);
            if (rn) analyticsScreen(rn);
            console.log('[NavigationContainer] Setting appReady to true');
            setAppReady(true);
          } catch (err) {
            console.error('[NavigationContainer] Error in onReady:', err);
          }
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
    </>
  );
}

export default function App() {
  // Description: Get theme mode from store and pass to ThemeProvider
  const themeMode = useThemeStore((state) => state.mode);

  console.log('[App] Rendering root component');

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider mode={themeMode}>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
