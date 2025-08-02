import React, { useState, useEffect } from 'react';
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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import * as ImagePicker from 'expo-image-picker';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Ionicons } from '@expo/vector-icons';
import { geohashForLocation } from 'geofire-common';
import {
  getFirestore,
  collection,
  addDoc,
  Timestamp,
  updateDoc,
  doc,
  arrayUnion,
  getDocs,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { updateEventCount } from '../../firebase/config';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import InterestSelector from '../../components/InterestSelector'; // Import the reusable InterestSelector

const GOOGLE_PLACES_API_KEY = GOOGLE_MAPS_API_KEY;

export default function CreateEventScreen({ location, onCancel, onSuccess }) {
  const { user } = useAuth();
  const db = getFirestore();
  const storage = getStorage();

  const [imageUri, setImageUri] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [manualAddress, setManualAddress] = useState('');
  const [manualLocation, setManualLocation] = useState(null);

  const [interestOptions, setInterestOptions] = useState([]);
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [isInterestPickerOpen, setIsInterestPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(''); // State for search term

  const [ageRange, setAgeRange] = useState([18, 99]);
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
  const [placeInput, setPlaceInput] = useState('');

  const [capacity, setCapacity] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const showDatePicker = () => setIsDatePickerVisible(true);
  const hideDatePicker = () => setIsDatePickerVisible(false);

  const handleConfirmDate = (selectedDate) => {
    // Round minutes to the nearest multiple of 5
    const roundedDate = new Date(selectedDate);
    const minutes = roundedDate.getMinutes();
    roundedDate.setMinutes(Math.round(minutes / 5) * 5);

    setDate(roundedDate);
    hideDatePicker();
  };

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

  const handleCreate = async () => {
    if (!title.trim()) return Alert.alert('Title is required');
    if (title.trim().length > 40)
      return Alert.alert('Title must not exceed 40 characters');
    if (description.trim().length < 10)
      return Alert.alert('Description must be at least 10 characters');
    if (date - new Date() < 60 * 60 * 1000)
      return Alert.alert('Event must be at least 1 hour ahead');
    if (!manualLocation && !location) return Alert.alert('Address is required');
    if (!selectedInterest) return Alert.alert('Select an interest');

    const privacyValue = privacyValues[privacyIndex];
    if (
      (privacyValue === 'female-only' && user.gender !== 'female') ||
      (privacyValue === 'male-only' && user.gender !== 'male')
    ) {
      return Alert.alert('Gender privacy mismatch');
    }

    const eventLocation = manualLocation || location;
    const geohash = geohashForLocation([
      eventLocation.latitude,
      eventLocation.longitude,
    ]);

    const extractedCity = manualAddress?.split(',')?.[1]?.trim() || '';

    const newEvent = {
      title: title.trim(),
      description: description.trim(),
      imageUrl: imageUrl || null,
      location: eventLocation,
      geohash,
      address: manualAddress,
      city: extractedCity,
      date: Timestamp.fromDate(date),
      createdAt: Timestamp.now(),
      ageRange,
      capacity: capacity ? parseInt(capacity, 10) : 0,
      privacy: privacyValue,
      genderFilter: 'any',
      ownerId: user.uid,
      interest: selectedInterest,
      eventTags: [],
      viewCount: 0,
      joinCount: 0,
      status: 'active',
      isReported: false,
      attendees: [],
    };

    setUploading(true);
    try {
      const docRef = await addDoc(collection(db, 'events'), newEvent);
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

  // Fetch categories (activities) from Firestore
  useEffect(() => {
    const fetchInterests = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'categories'));
        const interests = snapshot.docs.flatMap((doc) => {
          const data = doc.data();
          return (data.interests || []).map((i) => ({
            label: i.name,
            value: i.name,
          }));
        });
        setInterestOptions(JSON.parse(JSON.stringify(interests)));
      } catch (err) {
        console.error('Error fetching interests:', err);
        Alert.alert('Failed to load interests');
      }
    };
    fetchInterests();
  }, []);

  useEffect(() => {
    if (location?.address) {
      setManualAddress(location.address);
      setManualLocation({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    }
  }, [location]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <FlatList
          data={[]} // Dummy data to allow FlatList to render
          keyExtractor={() => 'dummy'} // Required prop
          ListHeaderComponent={
            <View>
              {/* Image Preview */}
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

              {/* Title */}
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder='Event title'
                placeholderTextColor='grey' // Updated to a darker color
              />

              {/* Description */}
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder='What’s your event about?'
                placeholderTextColor='grey' // Updated to a darker color
                multiline
              />

              {/* Date & Time */}
              <Text style={styles.label}>Date & Time</Text>
              <TouchableOpacity style={styles.input} onPress={showDatePicker}>
                <Text>
                  {date.toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Text>
              </TouchableOpacity>
              <DateTimePickerModal
                isVisible={isDatePickerVisible}
                mode='datetime'
                date={date}
                onConfirm={handleConfirmDate}
                onCancel={hideDatePicker}
                themeVariant='light' // Explicitly set theme to light
                textColor='#000' // Ensure text is visible
              />

              {/* Address Input */}
              <Text style={styles.label}>Location</Text>
              <View style={{ zIndex: 10 }}>
                <GooglePlacesAutocomplete
                  placeholder='Enter address'
                  placeholderTextColor='grey' // Updated to a darker color
                  minLength={2}
                  fetchDetails={true}
                  debounce={300}
                  enablePoweredByContainer={false}
                  keyboardShouldPersistTaps='handled'
                  predefinedPlaces={[]} // Prevents `.filter()` crash
                  styles={{
                    textInput: [styles.input, styles.flex],
                    container: { flex: 1 },
                    listView: {
                      backgroundColor: '#fff',
                      elevation: 5,
                      position: 'absolute',
                      top: 55,
                      maxHeight: 200,
                    },
                  }}
                  textInputProps={{
                    value: placeInput,
                    onChangeText: setPlaceInput,
                  }}
                  onPress={(data, details = null) => {
                    if (details?.geometry?.location) {
                      const { lat, lng } = details.geometry.location;
                      setManualLocation({ latitude: lat, longitude: lng });
                      setManualAddress(data?.description ?? '');
                      Alert.alert('Location set', 'Pin will be placed on map.');
                    }
                  }}
                  query={{
                    key: GOOGLE_MAPS_API_KEY,
                    language: 'en',
                  }}
                />
              </View>
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

              {/* Interests */}
              <Text style={styles.label}>Interest</Text>
              <InterestSelector
                selectedInterests={selectedInterest ? [selectedInterest] : []}
                toggleInterest={(interest) => setSelectedInterest(interest)}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
              />

              {/* Age Slider */}
              <Text style={styles.label}>
                Age Range: {ageRange[0]} - {ageRange[1]}
              </Text>
              <View style={styles.sliderWrapper}>
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

              {/* Privacy */}
              <Text style={styles.label}>Privacy</Text>
              {Platform.OS === 'ios' ? (
                <SegmentedControl
                  values={segments}
                  selectedIndex={privacyIndex}
                  onChange={(event) =>
                    setPrivacyIndex(event.nativeEvent.selectedSegmentIndex)
                  }
                  style={styles.segment}
                  backgroundColor='#f0f0f0'
                  tintColor='#007AFF'
                  fontStyle={{ color: '#333' }}
                  activeFontStyle={{ color: '#fff' }}
                />
              ) : (
                <View style={styles.androidPrivacyWrapper}>
                  {segments.map((seg, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.androidPrivacyBtn,
                        privacyIndex === idx && styles.androidPrivacyBtnActive,
                      ]}
                      onPress={() => setPrivacyIndex(idx)}
                    >
                      <Text
                        style={[
                          styles.androidPrivacyTxt,
                          privacyIndex === idx &&
                            styles.androidPrivacyTxtActive,
                        ]}
                      >
                        {seg}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Capacity */}
              <Text style={styles.label}>Capacity (optional)</Text>
              <TextInput
                style={styles.input}
                value={capacity}
                onChangeText={setCapacity}
                placeholder='Leave empty for unlimited'
                placeholderTextColor='grey' // Updated to a darker color
                keyboardType='numeric'
              />

              {/* Buttons */}
              <TouchableOpacity
                style={[styles.btn, uploading && styles.btnDis]}
                onPress={handleCreate}
                disabled={uploading}
              >
                <Text style={styles.btnTxt}>
                  {uploading ? 'Creating...' : 'Create Event'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    padding: 20,
    paddingBottom: 70,
    backgroundColor: '#fff',
    flex: 1,
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
    color: '#333',
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  flex: { flex: 1 },
  pinLocationText: { color: '#333', marginTop: 5 },
  dropdownBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 44,
  },
  dropdownInput: { color: '#444' },
  dropdownList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    maxHeight: 150,
  },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 10 },
  dropdownText: { fontSize: 14 },
  sliderWrapper: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  segment: { marginTop: 10, marginBottom: 20 },
  androidPrivacyWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 10,
  },
  androidPrivacyBtn: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    marginHorizontal: 3,
    alignItems: 'center',
    backgroundColor: '#fff', // Ensure white background
  },
  androidPrivacyBtnActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  androidPrivacyTxt: {
    color: '#333', // Dark text for better visibility
  },
  androidPrivacyTxtActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  btn: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 15,
  },
  btnDis: { backgroundColor: '#99cfff' },
  btnTxt: { color: '#fff', fontWeight: 'bold' },
  cancelButton: {
    marginTop: 15,
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#007AFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
