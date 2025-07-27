import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker'; // ✅ Import Expo-compatible date picker
import { Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

export default function NameDobScreen({ navigation }) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false); // Toggle for date picker
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onNext = async () => {
    if (!user) return;

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
      navigation.replace('Sex');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>Tell us about you</Text>

        <TextInput
          style={styles.input}
          placeholder='First name'
          value={firstName}
          onChangeText={setFirstName}
        />
        <TextInput
          style={styles.input}
          placeholder='Last name'
          value={lastName}
          onChangeText={setLastName}
        />

        <Text style={styles.label}>Date of Birth</Text>
        <TouchableOpacity
          style={styles.datePickerButton}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.datePickerText}>{dob.toDateString()}</Text>
        </TouchableOpacity>

        {/* ✅ Replace with Expo-compatible Date Picker */}
        {showPicker && (
          <DateTimePicker
            value={dob}
            mode='date'
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            minimumDate={
              new Date(new Date().setFullYear(new Date().getFullYear() - 100))
            }
            onChange={(event, selectedDate) => {
              setShowPicker(false);
              if (selectedDate) setDob(selectedDate);
            }}
          />
        )}

        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.nextButton} onPress={onNext}>
            Next
          </Text>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  label: {
    fontSize: 16,
    marginVertical: 8,
    color: '#333',
  },
  datePickerButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9f9f9',
    marginBottom: 16,
  },
  datePickerText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  nextButton: {
    color: 'white',
    fontSize: 18,
    marginVertical: 12,
    textAlign: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    overflow: 'hidden',
  },
  error: { color: 'red', textAlign: 'center', marginTop: 10 },
});
