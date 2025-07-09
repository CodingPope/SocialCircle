import React, { useState } from 'react';
import { View, Text, TextInput, Button, Image, ActivityIndicator, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

export default function ProfileSetupScreen() {
  const { user } = useAuth();
  const [bio, setBio] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickImage = async () => {
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!res.granted) {
      setError('Permission denied');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const finish = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      let url = '';
      if (image) {
        const response = await fetch(image);
        const blob = await response.blob();
        const storageRef = ref(storage, `profilePics/${user.uid}`);
        await uploadBytes(storageRef, blob);
        url = await getDownloadURL(storageRef);
      }
      await updateDoc(doc(db, 'users', user.uid), {
        bio,
        profilePicUrl: url,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complete your profile</Text>
      <Button title="Pick profile picture" onPress={pickImage} />
      {image && <Image source={{ uri: image }} style={{ width: 100, height: 100, marginVertical: 8 }} />}
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Short bio"
        multiline
        value={bio}
        onChangeText={setBio}
      />
      {loading ? <ActivityIndicator /> : <Button title="Finish" onPress={finish} />}
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
