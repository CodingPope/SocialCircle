import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './src/navigation/RootNavigation';
import { useAuth } from './src/context/AuthContext';
import { db } from './src/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const { user } = useAuth();
  const [profileComplete, setProfileComplete] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const isOnboarded =
            data.firstName &&
            data.lastName &&
            data.dob &&
            data.sex &&
            Array.isArray(data.interests) &&
            data.interests.length > 0 &&
            data.location?.latitude != null &&
            data.location?.longitude != null;
          setProfileComplete(isOnboarded);
        } else {
          setProfileComplete(false);
        }
      }
      setChecking(false);
    };
    check();
  }, [user]);

  if (checking) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator user={user} profileComplete={profileComplete} />
    </NavigationContainer>
  );
}
