// Description: Stack navigator for business onboarding steps with auth + resume guard.
import React, { useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../../../auth/context/AuthContext';
import { useBizOnboarding } from '../../stores/businessOnboardingStore';
import {
  IntroScreen,
  BasicsScreen,
  LocationScreen,
  ReviewScreen,
} from './screens';

const Stack = createNativeStackNavigator();

export default function BusinessOnboardingStack() {
  const { user, loading: authLoading } = useAuth();
  const {
    loading: storeLoading,
    hydrated,
    error,
    bizId,
    resumeLatestDraft,
  } = useBizOnboarding();

  useEffect(() => {
    // Description: Resume latest draft when user is authenticated and ready
    if (!authLoading && user?.uid) {
      resumeLatestDraft(user.uid);
    }
  }, [authLoading, user?.uid, resumeLatestDraft]);

  const initializing = authLoading || (!hydrated && storeLoading);

  if (initializing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size='large' color='#2F80ED' />
        <Text style={styles.helperText}>
          Preparing your business workspace…
        </Text>
      </View>
    );
  }

  if (!authLoading && !user) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Sign in required</Text>
        <Text style={styles.helperText}>
          Please sign in to continue business onboarding.
        </Text>
      </View>
    );
  }

  if (!storeLoading && !bizId && error) {
    // Description: Better error messaging for auth-related errors
    const isAuthError =
      error?.toLowerCase().includes('unauthenticated') ||
      error?.toLowerCase().includes('sign in');

    return (
      <View style={styles.center}>
        <Text style={styles.title}>
          {isAuthError
            ? 'Authentication Required'
            : "Can't load business setup"}
        </Text>
        <Text style={[styles.helperText, { color: '#C53030' }]}>
          {isAuthError
            ? 'Your session may have expired. Please try again or sign out and sign back in.'
            : error}
        </Text>
        <TouchableOpacity
          onPress={() =>
            user?.uid && resumeLatestDraft(user.uid, { force: true })
          }
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack.Navigator
      // Enable header to show native back button on top-left
      screenOptions={{ headerShown: true, headerBackTitle: 'Back' }}
      initialRouteName='Intro'
    >
      <Stack.Screen
        name='Intro'
        component={IntroScreen}
        options={{ title: 'Business onboarding' }}
      />
      <Stack.Screen
        name='Basics'
        component={BasicsScreen}
        options={{ title: 'Business basics' }}
      />
      <Stack.Screen
        name='Location'
        component={LocationScreen}
        options={{ title: 'Location' }}
      />
      <Stack.Screen
        name='Review'
        component={ReviewScreen}
        options={{ title: 'Review & submit' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8F9FA',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  helperText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2F80ED',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
