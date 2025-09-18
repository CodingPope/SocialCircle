// Description: App entry/session gate. Shows LoadingOverlay while checking auth/session.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import LoadingOverlay from './components/ui/LoadingOverlay';
import { onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth } from './features/auth/firebaseAuth'; // adjust import to your actual path
import MainNavigator from './navigation/MainNavigator'; // adjust import to your actual main navigator
import CreateAccountScreen from './screens/CreateAccountScreen'; // adjust as needed

export default function AppEntry() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
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
    return <MainNavigator user={user} />;
  }

  // If not logged in, show create account/login
  return <CreateAccountScreen />;
}
