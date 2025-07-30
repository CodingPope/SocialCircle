import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Animated,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config.js';

const InterestSelector = ({ selectedInterests, toggleInterest }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activities, setActivities] = useState([]);
  const [filteredActivities, setFilteredActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const allActivities = [];
        const categoriesSnapshot = await getDocs(collection(db, 'categories'));
        for (const categoryDoc of categoriesSnapshot.docs) {
          const categoryData = categoryDoc.data();
          categoryData.interests.forEach((interest) => {
            allActivities.push(interest.name);
          });
        }
        const sorted = [...new Set(allActivities)].sort((a, b) =>
          a.localeCompare(b, 'en', { sensitivity: 'base' })
        );
        setActivities(sorted);
        setFilteredActivities(sorted);
      } catch (error) {
        console.error('Error fetching activities:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => {
      const filtered = activities.filter((activity) =>
        activity.toLowerCase().includes(searchTerm.toLowerCase())
      );
      const sortedFiltered = [
        ...filtered.filter((activity) => selectedInterests.includes(activity)),
        ...filtered.filter((activity) => !selectedInterests.includes(activity)),
      ];
      setFilteredActivities(sortedFiltered);
    }, 300);
    return () => clearTimeout(delay);
  }, [searchTerm, activities, selectedInterests]);

  return (
    <View>
      <View style={styles.searchBoxContainer}>
        <TextInput
          style={styles.searchBox}
          placeholder='Search activities...'
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSearchTerm('')}
          >
            <Text style={styles.clearButtonText}>X</Text>
          </TouchableOpacity>
        )}
      </View>
      {loading ? (
        <ActivityIndicator size='large' color='#007BFF' />
      ) : filteredActivities.length === 0 ? (
        <Text
          style={{ textAlign: 'center', color: '#888', marginVertical: 10 }}
        >
          No activities found.
        </Text>
      ) : (
        <ScrollView style={styles.interestSelector}>
          {filteredActivities.map((activity, index) => (
            <TouchableOpacity
              key={`${activity}-${index}`} // Ensure unique key for each activity
              style={[
                styles.interestItem,
                selectedInterests.includes(activity) && styles.selectedInterest,
              ]}
              onPress={() => toggleInterest(activity)}
            >
              <Text
                style={{
                  color: selectedInterests.includes(activity) ? '#fff' : '#000',
                }}
              >
                {activity}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const EventFilterWindow = ({
  isVisible,
  onClose,
  onApplyFilters,
  selectedFilters,
  currentUserGender,
  userInterests,
  updateSelectedFilters,
}) => {
  const [selectedDate, setSelectedDate] = useState(
    selectedFilters?.date || null
  );
  const [selectedInterests, setSelectedInterests] = useState(
    selectedFilters?.interests || userInterests || []
  );
  const [genderOnly, setGenderOnly] = useState(
    selectedFilters?.genderOnly || false
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (isVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 500,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible]);

  useEffect(() => {
    if (selectedFilters) {
      setSelectedDate(selectedFilters.date || null);
      setSelectedInterests(selectedFilters.interests || userInterests || []);
      setGenderOnly(selectedFilters.genderOnly || false);
    } else {
      setSelectedDate(null);
      setSelectedInterests(userInterests || []);
      setGenderOnly(false);
    }
  }, [selectedFilters, userInterests]);

  if (!isVisible) return null;

  const handleApplyFilters = () => {
    const updatedFilters = {
      date: selectedDate,
      interests: selectedInterests,
      genderOnly: genderOnly ? currentUserGender : null,
    };
    onApplyFilters(updatedFilters);
    updateSelectedFilters(updatedFilters);
  };

  const handleClearFilters = () => {
    setSelectedDate(null);
    setSelectedInterests([]);
    setGenderOnly(false);
  };

  const handleResetFilters = () => {
    setSelectedDate(null);
    setSelectedInterests(userInterests || []);
    setGenderOnly(false);
  };

  const handleDateChange = (date) => {
    if (date) {
      const formattedDate = date.toISOString().split('T')[0];
      setSelectedDate(formattedDate);
    }
  };

  const toggleInterest = (interest) => {
    setSelectedInterests((prevSelected) =>
      prevSelected.includes(interest)
        ? prevSelected.filter((i) => i !== interest)
        : [...prevSelected, interest]
    );
  };

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={{ transform: [{ translateY: slideAnim }], ...styles.container }}
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
            onChange={(event, date) => {
              setShowDatePicker(false);
              handleDateChange(date);
            }}
          />
        )}

        <Text style={styles.sectionTitle}>Interests</Text>
        <InterestSelector
          selectedInterests={selectedInterests}
          toggleInterest={toggleInterest}
        />

        <Text style={styles.sectionTitle}>Privacy</Text>
        <TouchableOpacity
          style={[
            styles.genderFilterButton,
            genderOnly && styles.genderFilterButtonActive,
          ]}
          onPress={() => setGenderOnly((prev) => !prev)}
        >
          <Text
            style={{ color: genderOnly ? '#fff' : '#000', fontWeight: 'bold' }}
          >
            {currentUserGender === 'male' ? 'Male Only' : 'Women Only'}
          </Text>
        </TouchableOpacity>

        <View style={styles.filterButtonsContainer}>
          <TouchableOpacity
            style={styles.clearFilterButton}
            onPress={handleClearFilters}
          >
            <Text style={styles.clearButtonText}>Clear Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetFilters}
          >
            <Text style={styles.resetButtonText}>Reset Filters</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.applyButton}
          onPress={handleApplyFilters}
        >
          <Text style={styles.applyButtonText}>Apply Filters</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
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
    zIndex: 90,
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
    zIndex: 11,
  },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginVertical: 10 },
  datePickerButton: {
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  searchBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  searchBox: {
    flex: 1,
    paddingVertical: 8,
    color: '#444',
  },
  clearButton: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  filterButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  clearFilterButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    marginRight: 10,
  },
  resetButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  interestSelector: { maxHeight: 200, marginBottom: 20 },
  interestItem: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#f0f0f0',
  },
  selectedInterest: { backgroundColor: '#007BFF' },
  genderFilterButton: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  genderFilterButtonActive: {
    backgroundColor: '#007BFF',
  },
  applyButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#007BFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: { color: '#fff', fontWeight: 'bold' },
});

export default EventFilterWindow;
