import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
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
      navigation.replace('Interests');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
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
});
