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
  });

export default function NameDobScreen({ navigation }) {
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const keyboardAppearance = theme.isDark ? 'dark' : 'light';
  // Description: Pre-populate firstName and lastName if provided by Apple Sign-In or social login
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const hasPrefilledNames = !!(user?.firstName && user?.lastName);
  // State for name validation errors
  const [nameError, setNameError] = useState('');
  const [dob, setDob] = useState(new Date());
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const showDatePicker = () => setIsDatePickerVisible(true);
  const hideDatePicker = () => setIsDatePickerVisible(false);

  const handleConfirmDate = (date) => {
    setDob(date);
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
    if (hasPrefilledNames) {
      setNameError('');
      return true; // Apple provided name; do not force user to re-enter
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
    if (user?.firstName && user?.lastName && user?.dob) {
      // Description: User already has name and DOB from social sign-in, skip this screen
      navigation.reset({ index: 0, routes: [{ name: 'Sex' }] });
    }
  }, [user?.firstName, user?.lastName, user?.dob, navigation]);

  // Description: Handles Next button press, validates names and age
  const onNext = async () => {
    if (!user) return;
    if (!validateNames()) return;

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

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    setLoading(true);
    setError('');
    try {
      const firebaseDob = Timestamp.fromDate(dob);
      await mergeUserFields(user.uid, {
        firstName: trimmedFirst,
        lastName: trimmedLast,
        dob: firebaseDob,
        deviceToken: user?.deviceToken ?? null,
        pushOptIn: user?.pushOptIn ?? false,
      });
      setUser({
        ...user,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        dob: firebaseDob,
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
          <Text style={styles.header}>Tell us about you</Text>
          {/* Description: First name input with maxLength and validation */}
          <TextInput
            style={[styles.input, hasPrefilledNames ? { opacity: 0.6 } : null]}
            placeholder='First name'
            placeholderTextColor={
              theme.isDark ? theme.colors.neutral600 : theme.colors.neutral600
            }
            value={firstName}
            editable={!hasPrefilledNames}
            selectTextOnFocus={!hasPrefilledNames}
            onChangeText={
              hasPrefilledNames
                ? undefined
                : (text) => {
                    setFirstName(text);
                    if (nameError) validateNames();
                  }
            }
            maxLength={30}
            autoCapitalize='words'
            textContentType='givenName'
            keyboardAppearance={keyboardAppearance}
          />
          {/* Description: Last name input with maxLength and validation */}
          <TextInput
            style={[styles.input, hasPrefilledNames ? { opacity: 0.6 } : null]}
            placeholder='Last name'
            placeholderTextColor={
              theme.isDark ? theme.colors.neutral600 : theme.colors.neutral600
            }
            value={lastName}
            editable={!hasPrefilledNames}
            selectTextOnFocus={!hasPrefilledNames}
            onChangeText={
              hasPrefilledNames
                ? undefined
                : (text) => {
                    setLastName(text);
                    if (nameError) validateNames();
                  }
            }
            maxLength={30}
            autoCapitalize='words'
            textContentType='familyName'
            keyboardAppearance={keyboardAppearance}
          />

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
              <Text style={styles.dateText}>{dob.toDateString()}</Text>
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
