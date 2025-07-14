import React from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './RootNavigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth, AuthProvider } from '../context/AuthContext';

import AuthScreen from '../screens/Auth/AuthScreen';
import NameDobScreen from '../screens/Auth/Onboarding/NameDobScreen';
import SexScreen from '../screens/Auth/Onboarding/SexScreen';
import InterestsScreen from '../screens/Auth/Onboarding/InterestsScreen';
import LocationScreen from '../screens/Auth/Onboarding/LocationScreen';
import MapScreen from '../screens/Main/MapScreen';

const AuthStack = createNativeStackNavigator();
function AuthStackScreen() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name='Auth' component={AuthScreen} />
    </AuthStack.Navigator>
  );
}

const OnboardingStack = createNativeStackNavigator();
function OnboardingStackScreen() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
      <OnboardingStack.Screen name='NameDob' component={NameDobScreen} />
      <OnboardingStack.Screen name='Sex' component={SexScreen} />
      <OnboardingStack.Screen name='Interests' component={InterestsScreen} />
      <OnboardingStack.Screen name='Location' component={LocationScreen} />
    </OnboardingStack.Navigator>
  );
}

const MainStack = createNativeStackNavigator();
function MainStackScreen() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name='Map' component={MapScreen} />
      <Stack.Screen name='EventDetailScreen' component={EventDetailScreen} />
      <Stack.Screen name='CreateEvent' component={CreateEventScreen} />
    </MainStack.Navigator>
  );
}

import { CommonActions } from '@react-navigation/native';

function isUserOnboarded(user) {
  return (
    user != null &&
    user.firstName &&
    user.lastName &&
    user.dob && // Timestamp from Firestore is truthy
    user.sex &&
    Array.isArray(user.interests) &&
    user.interests.length > 0 &&
    user.location?.latitude != null &&
    user.location?.longitude != null
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  const isOnboarded = isUserOnboarded(user);

  // Guard: Only allow navigation reset to 'Map' if user is onboarded
  // This is a placeholder for where navigation reset might be dispatched
  // If you have a navigation ref or dispatch, add a guard like this:
  // if (isOnboarded) {
  //   navigation.dispatch(
  //     CommonActions.reset({
  //       index: 0,
  //       routes: [{ name: 'Map' }],
  //     })
  //   );
  // }

  return (
    <NavigationContainer ref={navigationRef}>
      {!user ? (
        <AuthStackScreen />
      ) : !isOnboarded ? (
        <OnboardingStackScreen />
      ) : (
        <MainStackScreen />
      )}
    </NavigationContainer>
  );
}

// wrap your entire App in the AuthProvider:
export function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
