import React, { useState } from 'react';
import { View, Text, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';

const interestsList = ['Hiking', 'Music', 'Food'];

export default function InterestScreen({ navigation }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggle = (item) => {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const handleNext = async () => {
    if (!user) return;
    setSaving(true);
    await updateDoc(doc(db, 'users', user.uid), { interests: selected });
    setSaving(false);
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Interests</Text>
      {interestsList.map((int) => (
        <TouchableOpacity
          key={int}
          onPress={() => toggle(int)}
          style={[styles.item, selected.includes(int) && styles.selected]}
        >
          <Text>{int}</Text>
        </TouchableOpacity>
      ))}
      {saving ? (
        <ActivityIndicator />
      ) : (
        <Button title='Next' onPress={handleNext} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 16 },
  item: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    marginVertical: 4,
  },
  selected: { backgroundColor: '#def' },
});
