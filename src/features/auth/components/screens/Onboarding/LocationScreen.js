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
import { serverTimestamp } from '../../../../../services/firebase/config';
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
    skipButton: {
      marginTop: theme.spacing.md,
    },
  });

export default function LocationScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [manualCity, setManualCity] = useState('');
  const [manualZip, setManualZip] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
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
        coords.longitude
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
        // Permission denied -> show manual city/ZIP picker
        setManualVisible(true);
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
      // If GPS fails for any reason, allow manual fallback
      console.warn(
        '[Location] getCurrentPosition failed:',
        err?.message || err
      );
      setManualVisible(true);
    } finally {
      setLoading(false);
    }
  };

  // Description: Skip location entirely and proceed to next screen (Apple Guideline 5.1.5 compliance)
  const handleSkip = async () => {
    try {
      // Save that user was prompted but chose to skip
      await mergeUserFields(user.uid, {
        locationPromptedAt: serverTimestamp(),
        deviceToken: user?.deviceToken ?? null,
        pushOptIn: user?.pushOptIn ?? false,
      });
      setUser({
        ...user,
        locationPromptedAt: new Date(),
      });
      await logOnboardingStepComplete('location', {
        method: 'skipped',
        granted: false,
      });
      // Description: Location is the last onboarding step - mark complete
      await completeOnboarding();
    } catch (err) {
      console.warn('[Location] Skip failed:', err);
      // Still proceed even if save fails
      await completeOnboarding();
    }
  };

  const saveManual = async () => {
    if (!manualCity && !manualZip) {
      Alert.alert('Missing info', 'Please enter a city or ZIP code.');
      return;
    }
    setManualSaving(true);
    try {
      const apiKey =
        typeof GOOGLE_MAPS_API_KEY !== 'undefined' ? GOOGLE_MAPS_API_KEY : '';
      const address = [manualCity, manualZip].filter(Boolean).join(' ');
      if (!apiKey) throw new Error('Missing Google Maps API key');
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          address
        )}&key=${apiKey}`
      );
      const data = await resp.json();
      if (data.status !== 'OK' || !data.results?.length) {
        throw new Error(
          'Could not resolve that location. Try a different city or ZIP.'
        );
      }
      const result = data.results[0];
      const loc = result.geometry?.location;
      if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
        throw new Error('Invalid geocoding response');
      }

      const cityComp =
        (result.address_components || []).find((c) =>
          c.types?.includes('locality')
        ) ||
        (result.address_components || []).find((c) =>
          c.types?.includes('postal_town')
        ) ||
        (result.address_components || []).find((c) =>
          c.types?.includes('administrative_area_level_2')
        );
      const zipComp = (result.address_components || []).find((c) =>
        c.types?.includes('postal_code')
      );
      const resolvedCity = cityComp?.long_name || manualCity || null;
      const resolvedZip = zipComp?.long_name || manualZip || null;

      await saveLocation({
        coords: { latitude: loc.lat, longitude: loc.lng, from: 'manual' },
        city: resolvedCity || undefined,
      });
      await logOnboardingStepComplete('location', {
        method: 'manual_entry',
        granted: true,
      });

      // Optionally store the postal code as well
      if (resolvedZip) {
        try {
          await mergeUserFields(user.uid, {
            postalCode: resolvedZip,
            deviceToken: user?.deviceToken ?? null,
            pushOptIn: user?.pushOptIn ?? false,
          });
          setUser({ ...useUserStore.getState().user, postalCode: resolvedZip });
        } catch {}
      }

      setManualVisible(false);
      // Description: Location is the last onboarding step - mark complete
      await completeOnboarding();
    } catch (e) {
      Alert.alert(
        'Location Error',
        e?.message || 'Failed to resolve city/ZIP.'
      );
    } finally {
      setManualSaving(false);
    }
  };

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
              <View style={styles.skipButton}>
                <Button
                  title='Skip for Now'
                  variant='secondary'
                  onPress={handleSkip}
                />
              </View>
            </>
          )}
        </View>
      </View>

      {/* Manual city/ZIP fallback */}
      <Modal
        visible={manualVisible}
        transparent
        animationType='slide'
        onRequestClose={() => setManualVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter Your City or ZIP</Text>
            <TextInput
              placeholder='City (e.g., Chicago)'
              value={manualCity}
              onChangeText={setManualCity}
              style={styles.input}
              autoCapitalize='words'
              returnKeyType='next'
              placeholderTextColor={theme.colors.neutral600}
              keyboardAppearance={keyboardAppearance}
            />
            <TextInput
              placeholder='ZIP (optional)'
              value={manualZip}
              onChangeText={setManualZip}
              style={styles.input}
              keyboardType='number-pad'
              returnKeyType='done'
              placeholderTextColor={theme.colors.neutral600}
              keyboardAppearance={keyboardAppearance}
            />
            {manualSaving ? (
              <ActivityIndicator size='small' color={theme.colors.primary} />
            ) : (
              <View style={styles.modalButtons}>
                <View style={styles.modalButtonSpacing}>
                  <Button
                    title='Skip'
                    variant='secondary'
                    onPress={() => {
                      setManualVisible(false);
                      handleSkip();
                    }}
                  />
                </View>
                <View style={styles.modalButtonSpacing}>
                  <Button title='Save' onPress={saveManual} />
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </AnimatedGradientBackground>
  );
}
