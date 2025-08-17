import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/navigation/RootNavigation';
import { useUserStore } from './src/store/userStore';
import { db } from './src/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import AppNavigator from './src/navigation/AppNavigator';
import * as Notifications from 'expo-notifications';

function AppContent() {
  // Description: Get user from Zustand store
  const user = useUserStore((state) => state.user);
  const [profileComplete, setProfileComplete] = useState(false);
  const [checking, setChecking] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(null);
  // Import onboarding router utility
  const { getNextOnboardingStep } = require('./src/utils/onboardingRouter');

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
        // Example: navigate based on notification payload
        // if (data.eventId) navigate('EventChat', { eventId: data.eventId });
      }
    );
    return () => sub.remove();
  }, []);

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
