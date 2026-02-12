import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native';
import AnimatedGradientBackground from '../../../../../components/ui/AnimatedGradientBackground';
import { Ionicons } from '@expo/vector-icons';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Timestamp } from '../../../../../services/firebase';
import { useUserStore } from '../../../../profile';
import { mergeUserFields } from '../../../../profile/api/userService';
import { logOnboardingStepComplete } from '../../../../../services/onboardingAnalyticsService';
import Button from '../../../../../components/ui/Button';
import { useTheme } from '../../../../../theme';

const createStyles = (theme) =>
  StyleSheet.create({
    gradientContainer: {
      flex: 1,
    },
    scrollContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: theme.spacing.xl,
    },
    header: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.isDark ? theme.colors.neutral900 : theme.colors.neutral100,
      textAlign: 'center',
      marginBottom: theme.spacing.lg,
    },
    greetingHeader: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.isDark ? theme.colors.neutral900 : theme.colors.neutral100,
      textAlign: 'center',
      marginBottom: theme.spacing.sm,
    },
    greetingSubtitle: {
      fontSize: 16,
      color: theme.isDark ? theme.colors.neutral700 : theme.colors.neutral400,
      textAlign: 'center',
      marginBottom: theme.spacing.xl,
    },
    input: {
      backgroundColor: theme.isDark
        ? 'rgba(30, 41, 59, 0.95)'
        : 'rgba(255, 255, 255, 0.85)',
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(148, 163, 184, 0.3)'
        : 'rgba(226, 232, 240, 0.5)',
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg,
      fontSize: 16,
      marginBottom: theme.spacing.lg,
      color: theme.isDark ? theme.colors.neutral900 : theme.colors.neutral900,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dateText: {
      fontSize: 16,
      color: theme.isDark ? theme.colors.neutral900 : theme.colors.neutral800,
    },
    error: {
      color: theme.colors.danger,
      marginBottom: theme.spacing.md,
      textAlign: 'center',
    },
    buttonWrapper: {
      width: '100%',
      marginTop: theme.spacing.md,
    },
    skipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: theme.spacing.md,
    },
    skipButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    skipText: {
      fontSize: 15,
      color: theme.isDark ? theme.colors.neutral600 : theme.colors.neutral500,
      fontWeight: '500',
    },
    dobLabel: {
      fontSize: 14,
      color: theme.isDark ? theme.colors.neutral600 : theme.colors.neutral500,
      textAlign: 'center',
      marginBottom: theme.spacing.xs,
    },
    ageCheckbox: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: theme.spacing.lg,
      paddingHorizontal: theme.spacing.md,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.isDark ? theme.colors.neutral600 : theme.colors.neutral500,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.spacing.sm,
    },
    checkboxChecked: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 15,
      color: theme.isDark ? theme.colors.neutral800 : theme.colors.neutral300,
      lineHeight: 20,
    },
  });

export default function NameDobScreen({ navigation }) {
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const keyboardAppearance = theme.isDark ? 'dark' : 'light';

  // Description: Check if this is an Apple Sign-In user
  const isAppleUser =
    user?.appleRelayEmail !== undefined ||
    user?.appleAuthorizationCode !== undefined ||
    user?.authProvider === 'apple';

  // Description: Pre-populate firstName and lastName if provided by Apple Sign-In or social login
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');

  // Description: For Apple users with name, show greeting. Without name, allow manual entry as recovery.
  const hasAppleName = isAppleUser && !!user?.firstName;
  const hasPrefilledNames = !!(user?.firstName && user?.lastName);
  // State for name validation errors
  const [nameError, setNameError] = useState('');
  const [dob, setDob] = useState(new Date());
  const [dobSelected, setDobSelected] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const showDatePicker = () => setIsDatePickerVisible(true);
  const hideDatePicker = () => setIsDatePickerVisible(false);

  const handleConfirmDate = (date) => {
    setDob(date);
    setDobSelected(true);
    hideDatePicker();
  };

  useEffect(() => {
    // Pulse animation for 2 seconds
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.05,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Description: Validates name fields for length and allowed characters
  const validateNames = () => {
    // Description: Apple users must use Apple-provided name, skip validation
    if (hasAppleName || hasPrefilledNames) {
      setNameError('');
      return true;
    }
    const nameRegex = /^[A-Za-z\-' ]{2,30}$/;
    if (!nameRegex.test(firstName)) {
      setNameError(
        'First name must be 2-30 letters, and only letters, hyphens, apostrophes, or spaces.',
      );
      return false;
    }
    if (!nameRegex.test(lastName)) {
      setNameError(
        'Last name must be 2-30 letters, and only letters, hyphens, apostrophes, or spaces.',
      );
      return false;
    }
    setNameError('');
    return true;
  };

  // Description: Skip to next step if name already provided (e.g., from Apple Sign-In)
  useEffect(() => {
    if (
      user?.firstName &&
      user?.lastName &&
      (user?.dob || user?.dobPromptedAt)
    ) {
      // Description: User already has name (and DOB or was prompted), skip this screen
      navigation.reset({ index: 0, routes: [{ name: 'Sex' }] });
    }
  }, [
    user?.firstName,
    user?.lastName,
    user?.dob,
    user?.dobPromptedAt,
    navigation,
  ]);

  // Description: Handles Next button press, validates names and age (DOB is optional)
  const onNext = async () => {
    if (!user) return;
    if (!validateNames()) return;

    // Description: Require age confirmation checkbox
    if (!ageConfirmed) {
      setError('Please confirm you are 18 or older to continue.');
      return;
    }

    // Description: Only validate age if user actively selected a DOB
    if (dobSelected) {
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      const dayDiff = today.getDate() - dob.getDate();

      if (
        age < 18 ||
        (age === 18 && (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)))
      ) {
        setError('You must be at least 18 years old.');
        return;
      }
    }

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    setLoading(true);
    setError('');
    try {
      const fields = {
        firstName: trimmedFirst,
        lastName: trimmedLast,
        dobPromptedAt: new Date().toISOString(),
        deviceToken: user?.deviceToken ?? null,
        pushOptIn: user?.pushOptIn ?? false,
      };
      let dobValue = null;
      if (dobSelected) {
        dobValue = Timestamp.fromDate(dob);
        fields.dob = dobValue;
      }
      await mergeUserFields(user.uid, fields);
      setUser({
        ...user,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        ...(dobSelected ? { dob: dobValue } : {}),
        dobPromptedAt: fields.dobPromptedAt,
      });
      await logOnboardingStepComplete('name_dob');
      navigation.reset({ index: 0, routes: [{ name: 'Sex' }] });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AnimatedGradientBackground
        style={styles.gradientContainer}
        variant='onboarding'
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {/* Description: Apple user with name - show greeting instead of inputs */}
          {hasAppleName ? (
            <>
              <Text style={styles.greetingHeader}>
                Hey {user.firstName}! 👋
              </Text>
              <Text style={styles.greetingSubtitle}>
                Let's finish setting up your profile
              </Text>
            </>
          ) : (
            <>
              {/* Description: Show name inputs for non-Apple users or Apple users needing recovery */}
              <Text style={styles.header}>Tell us about you</Text>
              {/* Description: First name input with maxLength and validation */}
              <TextInput
                style={styles.input}
                placeholder='First name'
                placeholderTextColor={
                  theme.isDark
                    ? theme.colors.neutral600
                    : theme.colors.neutral600
                }
                value={firstName}
                onChangeText={(text) => {
                  setFirstName(text);
                  if (nameError) validateNames();
                }}
                maxLength={30}
                autoCapitalize='words'
                textContentType='givenName'
                keyboardAppearance={keyboardAppearance}
              />
              {/* Description: Last name input with maxLength and validation */}
              <TextInput
                style={styles.input}
                placeholder='Last name'
                placeholderTextColor={
                  theme.isDark
                    ? theme.colors.neutral600
                    : theme.colors.neutral600
                }
                value={lastName}
                onChangeText={(text) => {
                  setLastName(text);
                  if (nameError) validateNames();
                }}
                maxLength={30}
                autoCapitalize='words'
                textContentType='familyName'
                keyboardAppearance={keyboardAppearance}
              />
            </>
          )}

          {/* Description: Age confirmation checkbox - required for all users */}
          <TouchableOpacity
            style={styles.ageCheckbox}
            onPress={() => {
              setAgeConfirmed(!ageConfirmed);
              if (error === 'Please confirm you are 18 or older to continue.') {
                setError('');
              }
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
              {ageConfirmed && (
                <Ionicons
                  name='checkmark'
                  size={18}
                  color='#fff'
                />
              )}
            </View>
            <Text style={styles.checkboxLabel}>
              I confirm that I am 18 years of age or older
            </Text>
          </TouchableOpacity>

          <Text style={styles.dobLabel}>Birthday (optional)</Text>
          <TouchableOpacity style={styles.input} onPress={showDatePicker}>
            <View style={styles.dateRow}>
              <Ionicons
                name='calendar-outline'
                size={20}
                color={
                  theme.isDark
                    ? theme.colors.neutral600
                    : theme.colors.neutral600
                }
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.dateText, !dobSelected && { opacity: 0.5 }]}>
                {dobSelected
                  ? dob.toDateString()
                  : 'Tap to select your birthday'}
              </Text>
            </View>
          </TouchableOpacity>

          <DateTimePickerModal
            isVisible={isDatePickerVisible}
            mode='date'
            date={dob}
            maximumDate={new Date()}
            minimumDate={
              new Date(new Date().setFullYear(new Date().getFullYear() - 100))
            }
            onConfirm={handleConfirmDate}
            onCancel={hideDatePicker}
            themeVariant='light'
            textColor='#000'
          />

          {/* Description: Show name validation error */}
          {nameError ? <Text style={styles.error}>{nameError}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Animated.View
            style={{ transform: [{ scale: scaleAnim }], width: '100%' }}
          >
            <View style={styles.buttonWrapper}>
              <Button
                title={loading ? 'Loading…' : 'Next'}
                onPress={onNext}
                disabled={loading}
              />
            </View>
          </Animated.View>
        </ScrollView>
      </AnimatedGradientBackground>
    </KeyboardAvoidingView>
  );
}
