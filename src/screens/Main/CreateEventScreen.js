// src/screens/Main/CreateEventScreen.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import {
  getFirestore,
  collection,
  addDoc,
  Timestamp,
  updateDoc,
  doc,
  arrayUnion,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';

const categoryOptions = [
  'Hiking',
  'Surf boarding',
  'Volleyball',
  'Bar hopping',
  'Coffee',
  'Dog walk',
  'Run',
  'Picnic',
  'Game night',
  'Board games',
  'Book club',
  'Workshop',
  'Networking',
  'Yoga',
  'Cooking class',
  'Movie night',
  'Live music',
  'Art exhibit',
  'Photography walk',
];
import { GOOGLE_MAPS_API_KEY } from '@env';

export default function CreateEventScreen({ location, onCancel, onSuccess }) {
  const { user } = useAuth();
  const db = getFirestore();
  const storage = getStorage();

  const [imageUri, setImageUri] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [privacy, setPrivacy] = useState('none');
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('99');
  const [category, setCategory] = useState('');
  const [capacity, setCapacity] = useState(''); // New capacity state as string
  const [uploading, setUploading] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [manualLocation, setManualLocation] = useState(null);

  // Geocode address to lat/lng
  const handleGeocode = async () => {
    if (!manualAddress.trim()) return Alert.alert('Enter an address');
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          manualAddress
        )}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const json = await res.json();
      if (json.status === 'OK') {
        const loc = json.results[0].geometry.location;
        setManualLocation({ latitude: loc.lat, longitude: loc.lng });
        Alert.alert('Location found!', 'Pin will be placed on map.');
      } else {
        Alert.alert('Address not found');
      }
    } catch (err) {
      Alert.alert('Error finding address');
    }
  };

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.Images,
      quality: 0.7,
    });
    if (!res.cancelled) setImageUri(res.uri);
  };

  const handleCreate = async () => {
    if (!title.trim()) return Alert.alert('Title is required');
    if (!category) return Alert.alert('Please select a category');
    if (date - new Date() > 7 * 24 * 60 * 60 * 1000)
      return Alert.alert('Event must be within 7 days');
    if (
      (privacy === 'female-only' && user.gender !== 'female') ||
      (privacy === 'male-only' && user.gender !== 'male')
    ) {
      return Alert.alert('You can only create an event for your own gender');
    }
    let eventLocation = location;
    if (manualLocation) eventLocation = manualLocation;

    setUploading(true);
    let imageUrl = '';

    if (imageUri) {
      try {
        const blob = await fetch(imageUri).then((r) => r.blob());
        const storageRef = ref(storage, `events/${user.uid}/${Date.now()}`);
        await uploadBytes(storageRef, blob);
        imageUrl = await getDownloadURL(storageRef);
      } catch (err) {
        console.warn(err);
        Alert.alert('Image upload failed');
        setUploading(false);
        return;
      }
    }

    try {
      const capacityNum = capacity.trim() === '' ? 0 : parseInt(capacity);
      const docRef = await addDoc(collection(db, 'events'), {
        ownerId: user.uid,
        title: title.trim(),
        description: description.trim(),
        date: Timestamp.fromDate(date),
        privacy,
        ageRange: [parseInt(ageMin), parseInt(ageMax)],
        category,
        imageUrl,
        location: eventLocation,
        capacity: capacityNum, // Add capacity to event document
        createdAt: Timestamp.now(),
      });
      await updateDoc(doc(db, 'users', user.uid), {
        createdEvents: arrayUnion(docRef.id),
      });
      onSuccess(eventLocation);
    } catch (err) {
      console.error(err);
      Alert.alert('Failed to create event');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Preview at top */}
      {imageUri && (
        <Image source={{ uri: imageUri }} style={styles.previewLarge} />
      )}
      <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
        <Text>{imageUri ? 'Change Photo' : 'Add Photo'}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder='Event title'
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder='What’s your event about?'
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>Or enter address manually</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder='Address'
          value={manualAddress}
          onChangeText={setManualAddress}
        />
        <TouchableOpacity style={styles.button} onPress={handleGeocode}>
          <Text style={styles.buttonText}>Find</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Date & Time</Text>
      <DateTimePicker
        value={date}
        mode='datetime'
        display='default'
        onChange={(_, d) => d && setDate(d)}
      />

      <Text style={styles.label}>Privacy</Text>
      <View style={styles.row}>
        {['none', 'female-only', 'male-only'].map((p) => (
          <TouchableOpacity key={p} onPress={() => setPrivacy(p)}>
            <Text style={privacy === p ? styles.selected : styles.option}>
              {p === 'none'
                ? 'Public'
                : p === 'female-only'
                ? 'Women Only'
                : 'Men Only'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Age Range</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.ageInput]}
          keyboardType='numeric'
          value={ageMin}
          onChangeText={setAgeMin}
        />
        <Text style={{ alignSelf: 'center' }}>to</Text>
        <TextInput
          style={[styles.input, styles.ageInput]}
          keyboardType='numeric'
          value={ageMax}
          onChangeText={setAgeMax}
        />
      </View>

      <Text style={styles.label}>Category</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipContainer}
      >
        {categoryOptions.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setCategory(cat)}
            style={category === cat ? styles.selectedChip : styles.chip}
          >
            <Text>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>Capacity (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder='Leave empty for unlimited'
        keyboardType='numeric'
        value={capacity}
        onChangeText={setCapacity}
      />

      <TouchableOpacity
        style={[styles.button, uploading && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={uploading}
      >
        <Text style={styles.buttonText}>
          {uploading ? 'Creating...' : 'Create Event'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onCancel} style={styles.cancel}>
        <Text>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    marginTop: 60,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  previewLarge: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  imagePicker: {
    marginBottom: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    alignItems: 'center',
  },
  label: { fontWeight: 'bold', marginTop: 15 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    marginTop: 5,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  option: { padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 6 },
  selected: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 6,
    backgroundColor: '#e6f0ff',
  },
  ageInput: { width: 60, textAlign: 'center' },
  chipContainer: { marginVertical: 10 },
  chip: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    marginRight: 10,
  },
  selectedChip: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 16,
    backgroundColor: '#e6f0ff',
    marginRight: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 6,
    marginTop: 25,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#99cfff' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  cancel: { marginTop: 15, alignItems: 'center' },
});
