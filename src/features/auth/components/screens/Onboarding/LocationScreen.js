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
import { logOnboardingStepComplete } from '../../../../../services/onboardingAnalyticsService';
import { geohashForLocation } from 'geofire-common';
import { mergeUserFields } from '../../../../profile/api/userService';
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
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg,
      alignItems: 'center',
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      marginBottom: theme.spacing.md,
      color: theme.colors.neutral900,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.neutral700,
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
      // Navigate to next onboarding screen
      navigation.replace('InterestsScreen');
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
      navigation.replace('InterestsScreen');
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
            To help you discover local events and friends, we need your location.
            Your data is private and only used for Social Circle features.
          </Text>
          {loading ? (
            <ActivityIndicator size='large' color='#ff6b6b' />
          ) : (
            <Button title='Share My Location' onPress={handleGetLocation} />
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
                    title='Cancel'
                    variant='secondary'
                    onPress={() => setManualVisible(false)}
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
