import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

const InterestSelector = ({
  selectedInterests,
  toggleInterest,
  searchTerm,
  setSearchTerm,
}) => {
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
      setFilteredActivities(filtered);
    }, 300);
    return () => clearTimeout(delay);
  }, [searchTerm, activities]);

  return (
    <View>
      <View style={styles.searchBoxContainer}>
        <TextInput
          style={styles.searchBox}
          placeholder='Search interests...'
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
        <Text style={styles.noResultsText}>No interests found.</Text>
      ) : (
        <ScrollView style={styles.interestSelector}>
          {filteredActivities.map((activity, index) => (
            <TouchableOpacity
              key={`${activity}-${index}`}
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

const styles = StyleSheet.create({
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
  noResultsText: {
    textAlign: 'center',
    color: '#888',
    marginVertical: 10,
  },
  interestSelector: { maxHeight: 200, marginBottom: 20 },
  interestItem: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#f0f0f0',
  },
  selectedInterest: { backgroundColor: '#007BFF' },
});

export default InterestSelector;
