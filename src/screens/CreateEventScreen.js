// src/screens/CreateEventScreen.js
import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet } from 'react-native';
import { db, auth } from '../services/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export default function CreateEventScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const createEvent = async () => {
    // For MVP: just create with a mock location
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, 'events'), {
      creatorId: user.uid,
      title,
      description,
      dateTime: serverTimestamp(),
      location: { lat: 37.78825, lng: -122.4324 },
      visibility: 'public',
      attendees: [],
      createdAt: serverTimestamp(),
      isVisible: true,
    });
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder='Event Title'
        value={title}
        onChangeText={setTitle}
        style={styles.input}
      />
      <TextInput
        placeholder='Event Description'
        value={description}
        onChangeText={setDescription}
        style={styles.input}
      />
      <Button title='Create' onPress={createEvent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    marginVertical: 10,
    padding: 10,
  },
});
