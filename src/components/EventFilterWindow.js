import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

const InterestSelector = ({ selectedInterests, setSelectedInterests }) => {
  const interests = [
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

  const toggleInterest = (interest) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  return (
    <ScrollView style={styles.interestSelector}>
      {interests.map((interest) => (
        <TouchableOpacity
          key={interest}
          style={[
            styles.interestItem,
            selectedInterests.includes(interest) && styles.selectedInterest,
          ]}
          onPress={() => toggleInterest(interest)}
        >
          <Text>{interest}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const EventFilterWindow = ({ onApplyFilters }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Filter Events</Text>

      <Text style={styles.sectionTitle}>Date</Text>
      <TouchableOpacity
        style={styles.datePickerButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Text>{selectedDate || 'Select Date'}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate ? new Date(selectedDate) : new Date()}
          mode='date'
          display='default'
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) {
              setSelectedDate(date.toISOString().split('T')[0]);
            }
          }}
        />
      )}

      <Text style={styles.sectionTitle}>Interests</Text>
      <InterestSelector
        selectedInterests={selectedInterests}
        setSelectedInterests={setSelectedInterests}
      />

      <TouchableOpacity
        style={styles.applyButton}
        onPress={() =>
          onApplyFilters({ date: selectedDate, interests: selectedInterests })
        }
      >
        <Text style={styles.applyButtonText}>Apply Filters</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  datePickerButton: {
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  interestSelector: {
    maxHeight: 200,
    marginBottom: 20,
  },
  interestItem: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#f0f0f0',
  },
  selectedInterest: {
    backgroundColor: '#007BFF',
  },
  applyButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#007BFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default EventFilterWindow;
