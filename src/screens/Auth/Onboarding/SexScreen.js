import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../../../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

export default function SexScreen({ navigation }) {
  const { user } = useAuth();
  const [sex, setSex] = useState('male');
  const [loading, setLoading] = useState(false);

  const onNext = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { sex });
      if (user.location?.latitude != null && user.location?.longitude != null) {
        navigation.replace('InterestsScreen'); // Ensure this matches the registered screen name
      } else {
        navigation.replace('LocationScreen'); // Ensure this matches the registered screen name
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Go Back Button */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.goBackButton}
      >
        <Text style={styles.goBackText}>Go Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>I am</Text>
      <Picker selectedValue={sex} onValueChange={setSex} style={styles.picker}>
        <Picker.Item label='Male' value='male' />
        <Picker.Item label='Female' value='female' />
        <Picker.Item label='Non-binary' value='non-binary' />
        <Picker.Item label='Prefer not to say' value='other' />
      </Picker>
      <Button
        title={loading ? 'Saving…' : 'Next'}
        onPress={onNext}
        disabled={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 16 },
  picker: { marginBottom: 24 },
  goBackButton: {
    marginBottom: 16,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  goBackText: {
    color: '#007AFF',
    fontSize: 16,
    textAlign: 'center',
  },
});
