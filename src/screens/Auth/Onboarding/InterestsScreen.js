import React, { useState } from 'react';
import { View, Text, Button, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

const OPTIONS = ['Hiking','Surf boarding','Volleyball','Bar hopping','Coffee','Dog walk','Run','Picnic'];

export default function InterestsScreen({ navigation }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = (item) => {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const onNext = async () => {
    setLoading(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { interests: selected });
      navigation.navigate('ProfileSetup');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose interests</Text>
      {OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt}
          onPress={() => toggle(opt)}
          style={[styles.item, selected.includes(opt) && styles.selected]}
        >
          <Text>{opt}</Text>
        </TouchableOpacity>
      ))}
      {loading ? <ActivityIndicator /> : <Button title="Next" onPress={onNext} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 16 },
  item: { padding: 10, borderWidth: 1, borderColor: '#ccc', marginVertical: 4, borderRadius: 4 },
  selected: { backgroundColor: '#def' },
  error: { color: 'red', textAlign: 'center', marginTop: 10 },
});
