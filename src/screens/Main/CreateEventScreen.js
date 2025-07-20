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
  KeyboardAvoidingView,
  FlatList,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Ionicons } from '@expo/vector-icons';
import { SelectList } from 'react-native-dropdown-select-list';
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
import { updateEventCount } from '../../firebase/config';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

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

// Convert categoryOptions to SelectList format
const categoryData = categoryOptions.map((c, idx) => ({
  key: idx.toString(),
  value: c,
}));

const GOOGLE_PLACES_API_KEY = GOOGLE_MAPS_API_KEY;

export default function CreateEventScreen({ location, onCancel, onSuccess }) {
  const { user } = useAuth();
  const db = getFirestore();
  const storage = getStorage();

  // Image upload state
  const [imageUri, setImageUri] = useState(null);
  const [imageUrl, setImageUrl] = useState('');

  // Basic fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());

  // Manual address
  const [manualAddress, setManualAddress] = useState('');
  const [manualLocation, setManualLocation] = useState(null);

  // Category search + selection
  const [category, setCategory] = useState('');

  // Age range slider
  const [ageRange, setAgeRange] = useState([18, 99]);

  // Privacy segmented control
  const [privacyIndex, setPrivacyIndex] = useState(0);
  const segments = [
    'Public',
    'RSVP',
    `${user.sex === 'female' ? 'Women' : 'Men'} Only`,
  ];
  const privacyValues = [
    'public',
    'rsvp',
    `${user.sex === 'female' ? 'female-only' : 'male-only'}`,
  ];

  const [capacity, setCapacity] = useState('');
  const [uploading, setUploading] = useState(false);

  // Geocode address
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
        Alert.alert('Location set', 'Pin will be placed on map.');
      } else {
        Alert.alert('Address not found');
      }
    } catch {
      Alert.alert('Error geocoding address');
    }
  };

  // Image picker + upload
  const pickImageAndUpload = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permission required');
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!res.canceled) {
        const uri = res.assets[0].uri;
        setImageUri(uri);
        const blob = await (await fetch(uri)).blob();
        const storageRef = ref(storage, `event-images/${Date.now()}`);
        const snap = await uploadBytes(storageRef, blob);
        setImageUrl(await getDownloadURL(snap.ref));
      }
    } catch (e) {
      Alert.alert('Upload error', e.message);
    }
  };

  // Create event
  const handleCreate = async () => {
    if (!title.trim()) return Alert.alert('Title is required');
    if (description.trim().length < 30)
      return Alert.alert('Description must be at least 30 characters');
    if (date - new Date() < 60 * 60 * 1000)
      return Alert.alert('Event must be at least 1 hour ahead');
    if (!manualLocation && !location) return Alert.alert('Address is required');
    if (!category) return Alert.alert('Select a category');
    const privacyValue = privacyValues[privacyIndex]; // Ensure correct privacy value is selected
    if (
      (privacyValue === 'female-only' && user.gender !== 'female') ||
      (privacyValue === 'male-only' && user.gender !== 'male')
    ) {
      return Alert.alert('Gender privacy mismatch');
    }
    const eventLocation = manualLocation || location;
    setUploading(true);
    try {
      const docRef = await addDoc(collection(db, 'events'), {
        ownerId: user.uid,
        title: title.trim(),
        description: description.trim(),
        date: Timestamp.fromDate(date),
        privacy: privacyValue, // Correctly set privacy in Firestore
        ageRange,
        category,
        imageUrl: imageUrl || null,
        location: eventLocation,
        capacity: capacity ? parseInt(capacity, 10) : 0,
        createdAt: Timestamp.now(),
        attendees: [],
      });
      await updateDoc(doc(db, 'users', user.uid), {
        createdEvents: arrayUnion(docRef.id),
      });
      onSuccess(eventLocation);
      await updateEventCount(user.uid);
    } catch (e) {
      console.error(e);
      Alert.alert('Creation failed');
    } finally {
      setUploading(false);
    }
  };

  React.useEffect(() => {
    // Prefill manual address if location has an address
    if (location?.address) {
      setManualAddress(location.address);
      setManualLocation({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    }
  }, [location]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior='padding'
      keyboardVerticalOffset={80}
    >
      <FlatList
        data={[{ key: 'form' }]} // Mock data to render the form
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: 30 }} // Add extra padding to ensure cancel button visibility
        renderItem={() => (
          <>
            {/* Photo */}
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.preview} />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text>No Image</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.photoBtn}
              onPress={pickImageAndUpload}
            >
              <Text style={styles.photoBtnText}>
                {imageUri ? 'Change Photo' : 'Add Photo'}
              </Text>
            </TouchableOpacity>

            {/* Title & Description */}
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder='Event title'
            />
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder='What’s your event about?'
              multiline
            />

            {/* Date & Time */}
            <Text style={styles.label}>Date & Time</Text>
            <DateTimePicker
              value={date}
              mode='datetime'
              display='default'
              onChange={(_, d) => d && setDate(d)}
            />

            {/* Manual Address with icon */}
            <Text style={styles.label}>Location</Text>
            <GooglePlacesAutocomplete
              placeholder='Enter address'
              minLength={2}
              fetchDetails={true}
              onPress={(data, details) => {
                if (details?.geometry?.location) {
                  const { lat, lng } = details.geometry.location;
                  setManualLocation({ latitude: lat, longitude: lng });
                  setManualAddress(data.description);
                  Alert.alert('Location set', 'Pin will be placed on map.');
                }
              }}
              query={{
                key: GOOGLE_PLACES_API_KEY,
                language: 'en',
              }}
              styles={{
                textInput: [styles.input, styles.flex],
                container: { marginTop: 10 },
                listView: { backgroundColor: '#fff', zIndex: 2 },
              }}
              enablePoweredByContainer={false}
              debounce={300}
            />
            {/* Retain pin location if selected from the map */}
            {manualLocation && (
              <View style={styles.row}>
                <Ionicons
                  name='location-outline'
                  size={20}
                  color='#666'
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.pinLocationText}>
                  Pin Location: {manualAddress || 'Unknown'}
                </Text>
              </View>
            )}

            {/* Category Picker + Search */}
            <View style={{ marginTop: 15 }}>
              <Text style={styles.label}>Category</Text>
              <SelectList
                data={categoryData}
                setSelected={(val) => setCategory(val)}
                save='value'
                placeholder='Search categories'
                boxStyles={styles.dropdownBox}
                dropdownStyles={styles.dropdownList}
                dropdownItemStyles={styles.dropdownItem}
                dropdownTextStyles={styles.dropdownText}
                inputStyles={styles.dropdownInput}
                searchPlaceholder='Type to filter…'
              />
            </View>

            {/* Age Range */}
            <Text style={styles.label}>
              Age Range: {ageRange[0]} - {ageRange[1]}
            </Text>
            <View style={styles.sliderContainer}>
              <MultiSlider
                values={ageRange}
                sliderLength={280}
                onValuesChange={setAgeRange}
                min={18}
                max={99}
                step={1}
                allowOverlap={false}
                snapped
              />
            </View>

            {/* Privacy moved below age and category */}
            <Text style={styles.label}>Privacy</Text>
            <SegmentedControl
              values={segments}
              selectedIndex={privacyIndex}
              onChange={(event) =>
                setPrivacyIndex(event.nativeEvent.selectedSegmentIndex)
              }
              style={styles.segment}
            />

            {/* Capacity */}
            <Text style={styles.label}>Capacity (optional)</Text>
            <TextInput
              style={styles.input}
              value={capacity}
              onChangeText={setCapacity}
              placeholder='Leave empty for unlimited'
              keyboardType='numeric'
            />

            {/* Submit & Cancel */}
            <TouchableOpacity
              style={[styles.btn, uploading && styles.btnDis]}
              onPress={handleCreate}
              disabled={uploading}
            >
              <Text style={styles.btnTxt}>
                {uploading ? 'Creating...' : 'Create Event'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} style={styles.cancel}>
              <Text>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  preview: { width: '100%', height: 200, borderRadius: 8, marginBottom: 10 },
  previewPlaceholder: {
    width: '100%',
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 10,
  },
  photoBtn: {
    padding: 10,
    backgroundColor: '#007AFF',
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 15,
  },
  photoBtnText: { color: '#fff', fontWeight: 'bold' },
  label: { fontWeight: 'bold', marginTop: 15 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    marginTop: 5,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  flex: { flex: 1 },
  geocodeBtn: {
    marginLeft: 10,
    padding: 10,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  geocodeTxt: { color: '#fff' },
  catList: { maxHeight: 150, marginTop: 5 },
  chip: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    marginVertical: 4,
  },
  chipSel: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipSelTxt: { color: '#fff' },
  segment: { marginTop: 10, marginBottom: 20 },
  btn: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 15,
  },
  btnDis: { backgroundColor: '#99cfff' },
  btnTxt: { color: '#fff', fontWeight: 'bold' },
  cancel: {
    marginTop: 15,
    alignItems: 'center',
  },
  dropdownBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 44,
  },
  dropdownInput: {
    color: '#444',
  },
  dropdownList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    maxHeight: 150,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  dropdownText: {
    fontSize: 14,
  },
  sliderContainer: {
    alignItems: 'center', // Center horizontally
    marginTop: 10,
  },
  pinLocationText: {
    color: '#333',
    marginTop: 5,
  },
});
