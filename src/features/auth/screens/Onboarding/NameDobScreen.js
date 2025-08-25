import React, { useState, useRef, useEffect } from 'react';
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
import AnimatedGradientBackground from '../../../../components/ui/AnimatedGradientBackground';
import { Ionicons } from '@expo/vector-icons';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../../firebase/config';
import { useUserStore } from '../../../../features/profile/userStore';

export default function NameDobScreen({ navigation }) {
  const user = useUserStore((state) => state.user);
  // State for name fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
    const nameRegex = /^[A-Za-z\-' ]{2,30}$/;
    if (!nameRegex.test(firstName)) {
      setNameError(
        'First name must be 2-30 letters, and only letters, hyphens, apostrophes, or spaces.'
      );
      return false;
    }
    if (!nameRegex.test(lastName)) {
      setNameError(
        'Last name must be 2-30 letters, and only letters, hyphens, apostrophes, or spaces.'
      );
      return false;
    }
    setNameError('');
    return true;
  };

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

    setLoading(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        firstName,
        lastName,
        dob: Timestamp.fromDate(dob),
      });
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
      <AnimatedGradientBackground style={styles.gradientContainer}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={styles.header}>Tell us about you</Text>
          {/* Description: First name input with maxLength and validation */}
          <TextInput
            style={styles.input}
            placeholder='First name'
            placeholderTextColor='#555'
            value={firstName}
            onChangeText={(text) => {
              setFirstName(text);
              if (nameError) validateNames();
            }}
            maxLength={30}
            autoCapitalize='words'
            textContentType='givenName'
          />
          {/* Description: Last name input with maxLength and validation */}
          <TextInput
            style={styles.input}
            placeholder='Last name'
            placeholderTextColor='#555'
            value={lastName}
            onChangeText={(text) => {
              setLastName(text);
              if (nameError) validateNames();
            }}
            maxLength={30}
            autoCapitalize='words'
            textContentType='familyName'
          />

          <TouchableOpacity style={styles.input} onPress={showDatePicker}>
            <View style={styles.dateRow}>
              <Ionicons
                name='calendar-outline'
                size={20}
                color='#555'
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
            <TouchableOpacity
              style={styles.nextButton}
              onPress={onNext}
              disabled={loading}
            >
              <Text style={styles.nextText}>
                {loading ? 'Loading...' : 'Next'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </AnimatedGradientBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },

  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E1E2F',
    textAlign: 'center',
    marginBottom: 24,
  },

  input: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    color: '#333',
  },
  nextButton: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  nextText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  error: {
    color: 'red',
    marginBottom: 12,
    textAlign: 'center',
  },
});
