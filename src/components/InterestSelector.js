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
import categoriesData from '../utils/categoriesData.json';

const InterestSelector = ({
  selectedInterests = [],
  toggleInterest = () => {},
  searchTerm, // optional controlled prop
  setSearchTerm, // optional controlled setter
}) => {
  // Local fallback search state when parent does not control search
  const [localSearch, setLocalSearch] = useState('');
  const effectiveSearch =
    typeof searchTerm === 'string' ? searchTerm : localSearch;
  const setEffectiveSearch =
    typeof setSearchTerm === 'function' ? setSearchTerm : setLocalSearch;

  const [activities, setActivities] = useState([]);
  const [filteredActivities, setFilteredActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      try {
        const allActivities = [];
        let usedSource = 'unknown';

        // Try Firestore first
        try {
          const categoriesSnapshot = await getDocs(
            collection(db, 'categories')
          );
          if (
            categoriesSnapshot &&
            categoriesSnapshot.docs &&
            categoriesSnapshot.docs.length
          ) {
            usedSource = 'firestore';
            for (const categoryDoc of categoriesSnapshot.docs) {
              const categoryData = categoryDoc.data() || {};
              const interests = categoryData.interests || [];
              if (Array.isArray(interests)) {
                interests.forEach((interest) => {
                  // interest may be an object or a string
                  if (!interest) return;
                  if (typeof interest === 'string')
                    allActivities.push(interest);
                  else if (typeof interest.name === 'string')
                    allActivities.push(interest.name);
                });
              }
            }
          } else {
            // No docs in Firestore -> fallback to local JSON
            throw new Error('No categories in Firestore');
          }
        } catch (err) {
          // Fallback: use bundled categoriesData.json
          try {
            if (Array.isArray(categoriesData)) {
              usedSource = 'bundled_json';
              categoriesData.forEach((cat) => {
                const interests = cat?.interests || [];
                if (Array.isArray(interests)) {
                  interests.forEach((interest) => {
                    if (!interest) return;
                    if (typeof interest === 'string')
                      allActivities.push(interest);
                    else if (typeof interest.name === 'string')
                      allActivities.push(interest.name);
                  });
                }
              });
            }
          } catch (fallbackErr) {
            console.error('Fallback categories parse error', fallbackErr);
          }
        }

        const sorted = [
          ...new Set(
            allActivities.map((a) => (a || '').trim()).filter(Boolean)
          ),
        ].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
        setActivities(sorted);
        setFilteredActivities(sorted);
        console.debug(
          `[InterestSelector] loaded ${sorted.length} activities (source=${usedSource})`
        );
      } catch (error) {
        console.error('Error fetching activities:', error);
        setActivities([]);
        setFilteredActivities([]);
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => {
      const term = (effectiveSearch || '').toLowerCase();
      const filtered = activities.filter((activity) =>
        activity.toLowerCase().includes(term)
      );

      // Reorder: selected interests should appear first (case-insensitive)
      const selectedSet = new Set(
        (selectedInterests || [])
          .map((s) => (s || '').toString().trim().toLowerCase())
          .filter(Boolean)
      );
      const reordered = filtered.slice().sort((a, b) => {
        const aSel = selectedSet.has((a || '').toLowerCase());
        const bSel = selectedSet.has((b || '').toLowerCase());
        if (aSel === bSel)
          return a.localeCompare(b, 'en', { sensitivity: 'base' });
        return aSel ? -1 : 1;
      });

      setFilteredActivities(reordered);
    }, 250);
    return () => clearTimeout(delay);
  }, [effectiveSearch, activities, selectedInterests]);

  return (
    <View>
      <View style={styles.searchBoxContainer}>
        <TextInput
          style={styles.searchBox}
          placeholder='Search interests...'
          value={effectiveSearch}
          onChangeText={setEffectiveSearch}
          placeholderTextColor='grey'
        />
        {effectiveSearch.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setEffectiveSearch('')}
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
