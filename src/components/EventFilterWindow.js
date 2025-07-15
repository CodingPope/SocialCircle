import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Animated,
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

const EventFilterWindow = ({ isVisible, onClose, onApplyFilters }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const slideAnim = useRef(new Animated.Value(500)).current; // Start off-screen

  useEffect(() => {
    if (isVisible) {
      Animated.timing(slideAnim, {
        toValue: 0, // Slide to visible position
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 500, // Slide off-screen
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            ...styles.container,
          }}
        >
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
              onApplyFilters({
                date: selectedDate,
                interests: selectedInterests,
              })
            }
          >
            <Text style={styles.applyButtonText}>Apply Filters</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    width: '100%',
    elevation: 5,
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
