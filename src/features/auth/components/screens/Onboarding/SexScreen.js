import React, { useState, useEffect, useMemo } from 'react';
import * as Location from 'expo-location';
import { Modal, ActivityIndicator } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useUserStore } from '../../../../profile';
import AnimatedGradientBackground from '../../../../../components/ui/AnimatedGradientBackground';
import { Ionicons } from '@expo/vector-icons';
import { logOnboardingStepComplete } from '../../../../../services/onboardingAnalytics';
import { mergeUserFields } from '../../../../profile/services/userService';
import { normalizeSex } from '../../../../profile/utils/userProfile';
import Button from '../../../../../components/ui/Button';
import { useTheme } from '../../../../../theme';

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary'];

const VALUE_TO_LABEL = {
  male: 'Male',
  female: 'Female',
  nonbinary: 'Non-binary',
};

const labelToValue = (label) => normalizeSex(label) || 'male';
const valueToLabel = (value) => VALUE_TO_LABEL[value] || 'Male';

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: theme.spacing.xl,
      justifyContent: 'center',
    },
    header: {
      fontSize: 28,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: theme.spacing.lg,
      color: theme.isDark ? theme.colors.neutral900 : theme.colors.neutral100,
      marginTop: theme.spacing.xl,
    },
    goBackButton: {
      position: 'absolute',
      top: 60,
      left: 24,
      backgroundColor: theme.isDark
        ? 'rgba(30, 41, 59, 0.95)'
        : 'rgba(255, 255, 255, 0.85)',
      borderRadius: theme.radii.md,
      paddingVertical: 6,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(148, 163, 184, 0.3)'
        : 'rgba(226, 232, 240, 0.5)',
    },
    goBackText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: '500',
    },
    genderContainer: {
      marginBottom: theme.spacing.xl,
    },
    genderOption: {
      backgroundColor: theme.isDark
        ? 'rgba(30, 41, 59, 0.95)'
        : 'rgba(255, 255, 255, 0.75)',
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(148, 163, 184, 0.3)'
        : 'rgba(226, 232, 240, 0.5)',
      paddingVertical: 14,
      borderRadius: theme.radii.lg,
      marginVertical: theme.spacing.sm,
      alignItems: 'center',
    },
    selectedOption: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    genderText: {
      fontSize: 18,
      color: theme.isDark ? theme.colors.neutral900 : theme.colors.neutral800,
    },
    selectedText: {
      color: theme.colors.neutral100,
      fontWeight: '600',
    },
    nextButtonContainer: {
      marginTop: theme.spacing.lg,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCard: {
      backgroundColor: theme.colors.neutral100,
      padding: theme.spacing.xl,
      borderRadius: theme.radii.lg,
      width: '85%',
      alignItems: 'center',
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      marginBottom: theme.spacing.md,
      color: theme.colors.neutral900,
      textAlign: 'center',
    },
    modalDescription: {
      fontSize: 15,
      color: theme.colors.neutral800,
      marginBottom: theme.spacing.lg,
      textAlign: 'center',
    },
    modalError: {
      color: theme.colors.danger,
      fontSize: 15,
      marginBottom: theme.spacing.md,
      textAlign: 'center',
    },
    modalActions: {
      marginTop: theme.spacing.md,
      width: '100%',
    },
  });

export default function SexScreen({ navigation }) {
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedSex, setSelectedSex] = useState(() =>
    valueToLabel(normalizeSex(user?.sex) || 'male')
  );
  const [loading, setLoading] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  const buttonScale = new Animated.Value(1);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(buttonScale, {
          toValue: 1.05,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(buttonScale, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      { iterations: 2 }
    ).start();
  }, []);

  useEffect(() => {
    const normalized = normalizeSex(user?.sex);
    if (!normalized) return;
    const label = valueToLabel(normalized);
    setSelectedSex((prev) => (prev === label ? prev : label));
  }, [user?.sex]);

  const onNext = async () => {
    setLoading(true);
    try {
      if (!user?.uid) {
        console.warn('SexScreen: missing user uid when saving sex selection.');
        return;
      }
      const normalizedSex = labelToValue(selectedSex);
      await mergeUserFields(user.uid, {
        sex: normalizedSex,
        deviceToken: user?.deviceToken ?? null,
        pushOptIn: user?.pushOptIn ?? false,
      });
      if (user) {
        setUser({ ...user, sex: normalizedSex });
      }
      await logOnboardingStepComplete('sex', {
        choice: normalizedSex || 'unknown',
      });
      setLocationModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGetLocation = async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission is required to continue.');
        setLocationLoading(false);
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      await mergeUserFields(user.uid, {
        location: coords,
        deviceToken: user?.deviceToken ?? null,
        pushOptIn: user?.pushOptIn ?? false,
      });
      setUser({ ...user, location: coords });
      await logOnboardingStepComplete('location', {
        method: 'gps_prompt',
        granted: true,
      });
      setLocationModalVisible(false);
      navigation.navigate('InterestsScreen');
    } catch (err) {
      setLocationError(err.message || 'Failed to get location.');
    } finally {
      setLocationLoading(false);
    }
  };

  return (
    <AnimatedGradientBackground style={styles.container} variant='onboarding'>
      <Text style={styles.header}>What's your gender?</Text>
      <TouchableOpacity
        onPress={() => {
          navigation.navigate('NameDob');
        }}
        style={styles.goBackButton}
      >
        <Text style={styles.goBackText}>Go Back</Text>
      </TouchableOpacity>
      <View style={styles.genderContainer}>
        {GENDER_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.genderOption,
              selectedSex === option && styles.selectedOption,
            ]}
            onPress={() => setSelectedSex(option)}
          >
            <Text
              style={[
                styles.genderText,
                selectedSex === option && styles.selectedText,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
        <View style={styles.nextButtonContainer}>
          <Button
            title={loading ? 'Saving…' : 'Next'}
            onPress={onNext}
            disabled={loading}
          />
        </View>
      </Animated.View>

      {/* Location Modal */}
      <Modal
        visible={locationModalVisible}
        animationType='fade'
        transparent
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Share Your Location</Text>
            <Text style={styles.modalDescription}>
              To help you discover local events and friends, we need your
              location. Your data is private and only used for Social Circle
              features.
            </Text>
            {locationLoading ? (
              <ActivityIndicator
                size='large'
                color={theme.colors.primary}
                style={{ marginVertical: 16 }}
              />
            ) : (
              <View style={styles.modalActions}>
                <Button title='Share My Location' onPress={handleGetLocation} />
              </View>
            )}
            {locationError ? (
              <View style={{ marginTop: theme.spacing.lg, width: '100%' }}>
                <Text style={styles.modalError}>{locationError}</Text>
                <Button
                  title='Try Again'
                  onPress={handleGetLocation}
                  variant='secondary'
                />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </AnimatedGradientBackground>
  );
}
