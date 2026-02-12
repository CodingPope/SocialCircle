import React, { useState, useEffect, useMemo } from 'react';
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
import { logOnboardingStepComplete } from '../../../../../services/onboardingAnalyticsService';
import { mergeUserFields } from '../../../../profile/api/userService';
import { normalizeSex } from '../../../../profile/utils/userProfile';
import Button from '../../../../../components/ui/Button';
import { useTheme } from '../../../../../theme';

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

const VALUE_TO_LABEL = {
  male: 'Male',
  female: 'Female',
  nonbinary: 'Non-binary',
  null: 'Prefer not to say',
};

const labelToValue = (label) => {
  if (label === 'Prefer not to say') return null;
  return normalizeSex(label) || null;
};
const valueToLabel = (value) => VALUE_TO_LABEL[value] || 'Prefer not to say';

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
    explainerText: {
      fontSize: 13,
      color: theme.isDark ? theme.colors.neutral600 : theme.colors.neutral500,
      textAlign: 'center',
      marginTop: theme.spacing.sm,
      lineHeight: 18,
    },
  });

export default function SexScreen({ navigation }) {
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedSex, setSelectedSex] = useState(() => {
    const normalized = normalizeSex(user?.sex);
    return normalized ? valueToLabel(normalized) : null;
  });
  const [loading, setLoading] = useState(false);

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
      { iterations: 2 },
    ).start();
  }, []);

  useEffect(() => {
    const normalized = normalizeSex(user?.sex);
    if (!normalized) return;
    const label = valueToLabel(normalized);
    setSelectedSex((prev) => (prev === label ? prev : label));
  }, [user?.sex]);

  // Description: Save gender selection (or null for skip/prefer-not-to-say) and proceed
  const saveSexAndNavigate = async (sexValue) => {
    setLoading(true);
    try {
      if (!user?.uid) {
        console.warn('SexScreen: missing user uid when saving sex selection.');
        return;
      }
      await mergeUserFields(user.uid, {
        sex: sexValue,
        sexPromptedAt: new Date().toISOString(),
        deviceToken: user?.deviceToken ?? null,
        pushOptIn: user?.pushOptIn ?? false,
      });
      if (user) {
        setUser({
          ...user,
          sex: sexValue,
          sexPromptedAt: new Date().toISOString(),
        });
      }
      await logOnboardingStepComplete('sex', {
        choice: sexValue || 'skipped',
      });
      navigation.navigate('TOS');
    } finally {
      setLoading(false);
    }
  };

  const onNext = async () => {
    const normalizedSex = labelToValue(selectedSex);
    await saveSexAndNavigate(normalizedSex);
  };

  return (
    <AnimatedGradientBackground style={styles.container} variant='onboarding'>
      <Text style={styles.header}>What's your gender?</Text>
      <TouchableOpacity
        onPress={() => {
          navigation.reset({ index: 0, routes: [{ name: 'NameDob' }] });
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
            disabled={loading || selectedSex === null}
          />
        </View>
      </Animated.View>
      <Text style={styles.explainerText}>
        You can add this later in Profile to access gender-specific safety
        filters
      </Text>
    </AnimatedGradientBackground>
  );
}
