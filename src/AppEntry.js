// Description: App entry/session gate. Shows LoadingOverlay while checking auth/session.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import LoadingOverlay from './components/ui/LoadingOverlay';
import { auth } from './services/firebase/config';
import AppNavigator from './navigation/AppNavigator';
import { AuthScreen } from './features/auth';

export default function AppEntry() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = auth().onAuthStateChanged((u) => {
      setUser(u);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  // Show overlay while checking session
  if (checking) {
    return <LoadingOverlay visible={true} />;
  }

  // If user is logged in, show main app
  if (user) {
    return <AppNavigator />;
  }

  // If not logged in, show auth flow
  return <AuthScreen />;
}
