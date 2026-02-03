// Description: Onboarding screen to request location permission and save user location to Firestore
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  StyleSheet,
} from 'react-native';
import {
  requestForegroundPermissionsAsync,
  getCurrentPositionAsync,
} from 'expo-location';
import { useUserStore } from '../../../../profile';
import {
  logOnboardingStepComplete,
  logOnboardingDone,
} from '../../../../../services/onboardingAnalyticsService';
import { geohashForLocation } from 'geofire-common';
import { mergeUserFields } from '../../../../profile/api/userService';
import { serverTimestamp } from '../../../../../services/firebase';
import AnimatedGradientBackground from '../../../../../components/ui/AnimatedGradientBackground';
import Button from '../../../../../components/ui/Button';
import { useTheme } from '../../../../../theme';

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.xl,
    },
    panel: {
      width: '100%',
      backgroundColor: theme.isDark
        ? 'rgba(30, 41, 59, 0.95)'
        : 'rgba(255, 255, 255, 0.9)',
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(148, 163, 184, 0.2)'
        : 'rgba(226, 232, 240, 0.5)',
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      marginBottom: theme.spacing.md,
      color: theme.isDark ? '#FFFFFF' : theme.colors.neutral900,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: theme.isDark ? '#FFFFFF' : theme.colors.neutral700,
      marginBottom: theme.spacing.xl,
      textAlign: 'center',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xl,
    },
    modalCard: {
      width: '100%',
      backgroundColor: theme.colors.neutral100,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: theme.spacing.md,
      color: theme.colors.neutral900,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.neutral400,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      color: theme.colors.neutral900,
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: theme.spacing.md,
    },
    modalButtonSpacing: {
      flex: 1,
      marginHorizontal: theme.spacing.sm / 2,
    },
  });

export default function LocationScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const keyboardAppearance = theme.isDark ? 'dark' : 'light';

  const computeCoarseHash5 = (lat, lng) => {
    try {
      const full = geohashForLocation([lat, lng]);
      return typeof full === 'string' ? full.substring(0, 5) : null;
    } catch {
      return null;
    }
  };

  // Description: Mark onboarding as complete and navigate to main app
  const completeOnboarding = async () => {
    try {
      await logOnboardingDone({ source: 'location_screen' });
      useUserStore.getState().setProfileComplete(true);
      // AppNavigator will automatically switch to main app when profileComplete becomes true
    } catch (err) {
      console.warn('[Location] Failed to mark onboarding complete:', err);
      // Still set profileComplete even if analytics logging fails
      useUserStore.getState().setProfileComplete(true);
    }
  };

  const saveLocation = async ({ coords, city }) => {
    const payload = {};
    if (
      coords &&
      typeof coords.latitude === 'number' &&
      typeof coords.longitude === 'number'
    ) {
      payload.location = coords;
      payload.coarseGeohash5 = computeCoarseHash5(
        coords.latitude,
        coords.longitude,
      );
    }
    if (city) payload.city = city;

    await mergeUserFields(user.uid, {
      ...payload,
      locationPromptedAt: serverTimestamp(),
      deviceToken: user?.deviceToken ?? null,
      pushOptIn: user?.pushOptIn ?? false,
    });

    setUser({
      ...user,
      ...(payload.location ? { location: payload.location } : {}),
      ...(payload.coarseGeohash5
        ? { coarseGeohash5: payload.coarseGeohash5 }
        : {}),
      ...(payload.city ? { city: payload.city } : {}),
      locationPromptedAt: new Date(),
    });
  };

  const handleGetLocation = async () => {
    setLoading(true);
    try {
      // Request location permission
      let { status } = await requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Permission denied -> log and allow skip
        await logOnboardingStepComplete('location', {
          method: 'gps_prompt',
          granted: false,
        });
        Alert.alert(
          'Location Permission Denied',
          'You can enable location access later in Settings to discover local events.',
        );
        setLoading(false);
        return;
      }
      // Get current location
      let loc = await getCurrentPositionAsync({});
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      await saveLocation({ coords });
      await logOnboardingStepComplete('location', {
        method: 'gps_prompt',
        granted: true,
      });
      // Description: Location is the last onboarding step - mark complete
      await completeOnboarding();
    } catch (err) {
      // If GPS fails, log error and allow user to skip
      console.warn(
        '[Location] getCurrentPosition failed:',
        err?.message || err,
      );
      await logOnboardingStepComplete('location', {
        method: 'gps_prompt',
        granted: false,
        error: err?.message,
      });
      Alert.alert(
        'Location Error',
        'Could not get your current location. You can enable it later in Settings.',
      );
      setLoading(false);
    }
  };

  // Description: Skip location entirely and proceed to next screen (Apple Guideline 5.1.5 compliance)
  return (
    <AnimatedGradientBackground style={styles.container} variant='onboarding'>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>Share Your Location</Text>
          <Text style={styles.subtitle}>
            To help you discover local events and friends, we need your
            location. Your data is private and only used for Social Circle
            features.
          </Text>
          {loading ? (
            <ActivityIndicator size='large' color='#ff6b6b' />
          ) : (
            <>
              <Button title='Share My Location' onPress={handleGetLocation} />
            </>
          )}
        </View>
      </View>
    </AnimatedGradientBackground>
  );
}
