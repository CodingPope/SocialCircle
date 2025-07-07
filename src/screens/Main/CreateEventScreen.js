import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  TextInput,
  Image,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import RangeSlider from 'rn-range-slider';
import {
  addDoc,
  collection,
  setDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../../firebase/config';

// Example geocoding helper function (you must implement this)
async function geocodeAddress(address) {
  // For example, call Google Geocoding API:
  // const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=YOUR_API_KEY`);
  // const data = await response.json();
  // if (data.status === "OK") {
  //   const location = data.results[0].geometry.location;
  //   return { latitude: location.lat, longitude: location.lng };
  // } else {
  //   throw new Error('Geocoding error');
  // }
  // For demo purposes, return a fixed coordinate:
  return { latitude: 39.75, longitude: -105.0 };
}

export default function CreateEventScreen({ navigation, onClose, onSuccess }) {
  const [bannerUri, setBannerUri] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Hiking');
  const [address, setAddress] = useState(''); // User-entered address
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [attendanceCap, setAttendanceCap] = useState('');
  const [ageRange, setAgeRange] = useState({ min: 18, max: 99 });
  const [privacySetting, setPrivacySetting] = useState('Public');

  // Dropdown options (or use a custom dropdown component as before)
  const categoryOptions = [
    { label: 'Hiking', value: 'Hiking' },
    { label: 'Brunch', value: 'Brunch' },
    { label: 'Movies', value: 'Movies' },
    { label: 'Volleyball', value: 'Volleyball' },
  ];
  const privacyOptions = [
    { label: 'Public', value: 'Public' },
    { label: 'Friends Only', value: 'Friends' },
    { label: 'Private', value: 'Private' },
  ];

  const handleUploadBanner = () => {
    // Integrate your image picker here.
    setBannerUri('https://via.placeholder.com/400x200.png?text=Banner');
  };

  const onChangeDate = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const now = new Date();
      const maxDate = new Date(now);
      maxDate.setDate(now.getDate() + 3);
      if (selectedDate > maxDate) {
        alert('Event date cannot be more than 3 days in advance.');
        setDate(maxDate);
      } else {
        setDate(selectedDate);
      }
    }
  };

  // Range slider handlers
  const renderThumb = () => <View style={styles.sliderThumb} />;
  const renderRail = () => <View style={styles.sliderRail} />;
  const renderRailSelected = () => <View style={styles.sliderRailSelected} />;
  const renderLabel = (value) => (
    <Text style={styles.sliderLabel}>{value}</Text>
  );
  const renderNotch = () => <View style={styles.sliderNotch} />;
  const handleValueChange = (low, high) => {
    if (ageRange.min !== low || ageRange.max !== high) {
      setAgeRange({ min: low, max: high });
    }
  };

  // New create event handler that includes geocoding and group chat creation
  const handleCreateEvent = async () => {
    try {
      // Convert address to coordinates
      const coordinates = await geocodeAddress(address);

      // Gather event data
      const eventData = {
        bannerUri,
        title,
        description,
        category,
        address, // Store the address string
        coordinates, // { latitude, longitude }
        date,
        attendanceCap,
        ageRange,
        privacySetting,
        createdAt: serverTimestamp(),
      };

      // Create event document in Firestore
      const eventDocRef = await addDoc(collection(db, 'events'), eventData);

      // Create a group chat document for this event
      await setDoc(doc(db, 'eventChats', eventDocRef.id), {
        eventId: eventDocRef.id,
        messages: [], // Initialize with empty messages array
        createdAt: serverTimestamp(),
      });

      if (onSuccess) {
        onSuccess();
      } else {
        navigation.navigate('Map');
      }
    } catch (error) {
      console.error('Error creating event:', error);
      alert('There was an error creating your event. Please try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Banner Upload */}
      <TouchableOpacity
        style={styles.bannerContainer}
        onPress={handleUploadBanner}
      >
        {bannerUri ? (
          <Image source={{ uri: bannerUri }} style={styles.bannerImage} />
        ) : (
          <Text style={styles.bannerText}>Tap to upload banner</Text>
        )}
      </TouchableOpacity>

      {/* Title, Description, and Address */}
      <TextInput
        style={styles.input}
        placeholder='Event Title'
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, { height: 100 }]}
        placeholder='Event Description'
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <TextInput
        style={styles.input}
        placeholder='Enter Address'
        value={address}
        onChangeText={setAddress}
      />

      {/* Category Selector */}
      <View style={styles.selectorContainer}>
        <Text style={styles.selectorLabel}>Category:</Text>
        <Picker
          selectedValue={category}
          style={[styles.picker, { color: '#000' }]}
          itemStyle={{ color: '#000' }}
          onValueChange={(itemValue) => setCategory(itemValue)}
        >
          {categoryOptions.map((option) => (
            <Picker.Item
              key={option.value}
              label={option.label}
              value={option.value}
              color='#000'
            />
          ))}
        </Picker>
      </View>

      {/* Date & Time Selector */}
      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Text style={styles.dateButtonText}>
          Date & Time: {date.toLocaleString()}
        </Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode='datetime'
          display='default'
          onChange={onChangeDate}
          minimumDate={new Date()}
          maximumDate={(() => {
            const now = new Date();
            const max = new Date(now);
            max.setDate(now.getDate() + 3);
            return max;
          })()}
        />
      )}

      {/* Attendance Cap */}
      <TextInput
        style={[styles.input, styles.halfWidthInput]}
        placeholder='Attendance Cap'
        value={attendanceCap}
        onChangeText={setAttendanceCap}
        keyboardType='numeric'
      />

      {/* Age Range Slider */}
      <View style={styles.sliderContainer}>
        <Text style={styles.sliderContainerLabel}>
          Age Range: {ageRange.min} - {ageRange.max}
        </Text>
        <RangeSlider
          min={18}
          max={99}
          low={ageRange.min}
          high={ageRange.max}
          step={1}
          renderThumb={renderThumb}
          renderRail={renderRail}
          renderRailSelected={renderRailSelected}
          renderLabel={renderLabel}
          renderNotch={renderNotch}
          onValueChanged={handleValueChange}
        />
      </View>

      {/* Privacy Selector */}
      <View style={styles.selectorContainer}>
        <Text style={styles.selectorLabel}>Privacy:</Text>
        <Picker
          selectedValue={privacySetting}
          style={[styles.picker, { color: '#000' }]}
          itemStyle={{ color: '#000' }}
          onValueChange={(itemValue) => setPrivacySetting(itemValue)}
        >
          {privacyOptions.map((option) => (
            <Picker.Item
              key={option.value}
              label={option.label}
              value={option.value}
              color='#000'
            />
          ))}
        </Picker>
      </View>

      {/* Create Event Button */}
      <TouchableOpacity style={styles.createButton} onPress={handleCreateEvent}>
        <Text style={styles.createButtonText}>Create Event</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f9f9f9',
  },
  // Banner styles
  bannerContainer: {
    height: 200,
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 20,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  bannerText: {
    fontSize: 18,
    color: '#888',
  },
  // Input styles
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  halfWidthInput: {
    width: '50%',
  },
  // Selector styles
  selectorContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 20,
    overflow: 'hidden',
  },
  selectorLabel: {
    fontSize: 16,
    padding: 10,
    backgroundColor: '#f0f0f0',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  // Date button styles
  dateButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  // Slider styles (for age range)
  sliderContainer: {
    marginBottom: 20,
  },
  sliderContainerLabel: {
    fontSize: 16,
    marginBottom: 10,
  },
  sliderThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#007BFF',
  },
  sliderRail: {
    flex: 1,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
  },
  sliderRailSelected: {
    height: 4,
    backgroundColor: '#007BFF',
    borderRadius: 2,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  sliderNotch: {
    width: 8,
    height: 8,
    backgroundColor: '#007BFF',
    borderRadius: 4,
  },
  // Create button styles
  createButton: {
    backgroundColor: '#007BFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 40,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
