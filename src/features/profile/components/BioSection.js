// src/components/profile/BioSection.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

export default function BioSection({ bio, setBio, onSaveBio }) {
  const [editing, setEditing] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>About Me</Text>
      {editing ? (
        <>
          <TextInput
            style={styles.input}
            value={bio}
            onChangeText={setBio}
            multiline
          />
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              onSaveBio();
              setEditing(false);
            }}
          >
            <Text style={styles.buttonText}>Save</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.bio}>{bio || 'No bio yet'}</Text>
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.edit}>Edit</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 15, marginVertical: 10 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 5 },
  bio: { color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 8,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
    minHeight: 60,
  },
  button: {
    marginTop: 5,
    backgroundColor: '#007AFF',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  edit: { color: '#007AFF', marginTop: 5 },
});
