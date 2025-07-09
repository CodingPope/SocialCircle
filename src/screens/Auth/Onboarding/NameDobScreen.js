import React, { useState } from 'react';
import { View, TextInput, Text, Button, ActivityIndicator, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

export default function NameDobScreen({ navigation }) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onNext = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        firstName,
        lastName,
        dob: Timestamp.fromDate(dob),
      });
      navigation.navigate('Location');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tell us about you</Text>
      <TextInput style={styles.input} placeholder="First name" value={firstName} onChangeText={setFirstName} />
      <TextInput style={styles.input} placeholder="Last name" value={lastName} onChangeText={setLastName} />
      <Button title="Select date of birth" onPress={() => setShowPicker(true)} />
      {showPicker && (
        <DateTimePicker value={dob} onChange={(e, d) => { setShowPicker(false); if (d) setDob(d); }} />
      )}
      {loading ? <ActivityIndicator /> : <Button title="Next" onPress={onNext} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', marginVertical: 8, padding: 8 },
  error: { color: 'red', textAlign: 'center', marginTop: 10 },
});
