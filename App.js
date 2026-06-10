import React, { useEffect, useState, useMemo } from 'react';
import { AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { navigationRef, navigate } from './src/navigation/RootNavigation';
import { useUserStore, useSessionRole } from './src/features/profile';
import { db } from './src/services/firebase/config';
import AppNavigator from './src/navigation/AppNavigator';
import Constants from 'expo-constants';
import { initErrorReporting } from './src/lib/errorReporting';
import logger from './src/lib/logger';
import { screen as analyticsScreen } from './src/services/analyticsService';
import { AuthProvider } from './src/features/auth/context/AuthContext';

// Initialize error reporting once at module load to capture early errors
// Sentry temporarily disabled until __extends error is resolved
import LoadingOverlay from './src/components/ui/LoadingOverlay'; // Added LoadingOverlay import
import { recordDailySessionHeartbeat } from './src/services/sessionHeartbeatService';
import { ThemeProvider, lightTheme, darkTheme } from './src/theme';
import { useThemeStore } from './src/store/themeStore';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppProviders from './src/providers/AppProviders';

// Description: Keep splash screen visible while app loads
SplashScreen.preventAutoHideAsync().catch((err) => {
  console.error('[App] Failed to prevent auto hide splash:', err);
});
logger.debug('[App] Initializing Social Circle app');

// Initialize Sentry error reporting at startup (no-op if DSN is empty)
initErrorReporting({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  environment: process.env.EXPO_PUBLIC_SENTRY_ENV || 'development',
});

function AppContent() {
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

  // Import onboarding router utility
  const {
    getNextOnboardingStep,
  } = require('./src/features/auth/utils/onboardingRouter');

  // Description: Safety timeout - force hide splash screen after 10 seconds if stuck
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!appReady) {
        logger.warn(
          '[AppContent] Timeout reached without app ready. Force hiding splash screen.',
        );
        logger.warn('[AppContent] Debug state:', {
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
    if (!storeLoading && !checking && appReady) {
      const hideSplash = async () => {
        try {
          await SplashScreen.hideAsync();
        } catch (err) {
          logger.warn(
            '[AppContent] Splash already hidden or error:',
            err?.message || err,
          );
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

  // NEW: Start auth listener once on mount (since AuthProvider is not used)
  useEffect(() => {
    logger.debug('[AppContent] Setting up auth listener');
    try {
      const listen = useUserStore.getState().listenAuthState;
      if (typeof listen === 'function') {
        listen();
      } else {
        logger.error(
          '[AppContent] listenAuthState is not a function:',
          typeof listen,
        );
      }
    } catch (err) {
      logger.error(
        '[AppContent] Failed to start auth listener:',
        err?.message || err,
      );
    }
  }, []);

  useEffect(() => {
    logger.debug('[AppContent] Checking user profile. User UID:', user?.uid);
    const check = async () => {
      if (user) {
        try {
          const userDocRef = db.collection('users').doc(user.uid);
          const snap = await userDocRef.get();
          if (snap.exists) {
            const data = snap.data();
            const nextStep = getNextOnboardingStep(data);
            logger.debug('[AppContent] Next onboarding step:', nextStep);
            setOnboardingStep(nextStep);
            setProfileComplete(!nextStep);
          } else {
            setProfileComplete(false);
            setOnboardingStep('NameDob');
          }
        } catch (err) {
          logger.error(
            '[AppContent] Error fetching user profile:',
            err?.message || err,
          );
          setProfileComplete(false);
          setOnboardingStep('NameDob');
        }
      }
      setChecking(false);
    };
    check();
  }, [user]);

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
      handleAppStateChange,
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
            logger.debug('[NavigationContainer] onReady, current route:', rn);
            if (rn) analyticsScreen(rn);
            setAppReady(true);
          } catch (err) {
            logger.error(
              '[NavigationContainer] Error in onReady:',
              err?.message || err,
            );
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
          try {
            const rn = navigationRef.current?.getCurrentRoute()?.name;
            navigationRef.routeNameRef = rn;
            logger.debug('[NavigationContainer] onReady, current route:', rn);
            if (rn) analyticsScreen(rn);
            setAppReady(true);
          } catch (err) {
            logger.error(
              '[NavigationContainer] Error in onReady:',
              err?.message || err,
            );
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
    <AppProviders user={user} sessionRole={sessionRole} setUser={setUser}>
      <>
        {navigator}
        <LoadingOverlay visible={showLoadingOverlay} />
      </>
    </AppProviders>
  );
}

export default function App() {
  // Description: Get theme mode from store and pass to ThemeProvider
  const themeMode = useThemeStore((state) => state.mode);

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
