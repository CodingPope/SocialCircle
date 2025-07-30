import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  Animated,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  doc,
  updateDoc,
  collection,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

export default function ManageInterestsScreen({ navigation }) {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    const fetchCategoriesAndUserInterests = async () => {
      try {
        // Fetch categories
        const snapshot = await getDocs(collection(db, 'categories'));
        const fetchedCategories = snapshot.docs.map((categoryDoc) => ({
          id: categoryDoc.id,
          name: categoryDoc.data().name,
          interests: categoryDoc.data().interests || [],
        }));

        // Add "All" category
        const allInterests = fetchedCategories.flatMap((cat) => cat.interests);
        fetchedCategories.unshift({
          id: 'all',
          name: 'All',
          interests: allInterests,
        });

        setCategories(fetchedCategories);

        // Fetch user's selected interests
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setSelected(userData.interests || []); // Prepopulate selected interests
        }

        setActiveCategory(fetchedCategories[0]?.id || '');
        fadeIn();
      } catch (e) {
        console.error(e);
        setError('Failed to load categories or user interests.');
      }
    };

    fetchCategoriesAndUserInterests();
  }, []);

  const fadeIn = () => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const toggle = (itemId) => {
    setSelected((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const onSave = async () => {
    setLoading(true);
    try {
      if (selected.length > 30) {
        setError('You can select up to 30 interests only.');
        setLoading(false);
        return;
      }

      // Update user's selected interests in Firestore
      await updateDoc(doc(db, 'users', user.uid), { interests: selected });

      Alert.alert('Success', 'Your interests have been updated.');
      navigation.goBack(); // Navigate back to the profile page
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const currentActivities =
    activeCategory === 'all'
      ? Array.from(
          new Map(
            categories.flatMap((cat) => cat.interests).map((a) => [a.name, a]) // Deduplicate by `name`
          ).values()
        )
      : categories.find((cat) => cat.id === activeCategory)?.interests || [];

  const filteredActivities = currentActivities.filter((activity) =>
    activity.name.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name='arrow-back' size={24} color='#333' />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Interests</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Category Label */}
      <Text style={styles.sectionLabel}>Select a Category</Text>
      <View style={styles.categoriesContainer}>
        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalScroll}
          >
            <View style={styles.categoryRows}>
              {Array.from({ length: 2 }).map((_, rowIndex) => (
                <View key={`row-${rowIndex}`} style={styles.categoryRow}>
                  {categories
                    .slice(
                      rowIndex * Math.ceil(categories.length / 2),
                      (rowIndex + 1) * Math.ceil(categories.length / 2)
                    )
                    .map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.categoryChip,
                          activeCategory === cat.id &&
                            styles.activeCategoryChip,
                        ]}
                        onPress={() => {
                          setActiveCategory(cat.id);
                          if (cat.id !== 'all') setFilterText('');
                          fadeIn();
                        }}
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            activeCategory === cat.id &&
                              styles.activeCategoryChipText,
                          ]}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Activities Label */}
      <Text style={styles.sectionLabel}>
        {activeCategory === 'all'
          ? 'Filter All Activities'
          : `Choose Activities in ${
              categories.find((c) => c.id === activeCategory)?.name || ''
            }`}
      </Text>

      {/* Filter Textbox */}
      {activeCategory === 'all' && (
        <TextInput
          style={styles.filterInput}
          placeholder='Search activities...'
          value={filterText}
          onChangeText={setFilterText}
        />
      )}

      {/* Selected Count */}
      <View style={styles.selectedCountRow}>
        <Text style={styles.selectedCountText}>{selected.length} Selected</Text>
      </View>

      {/* Activities */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView style={styles.activitiesScroll}>
          <View style={styles.activitiesGrid}>
            {filteredActivities.length > 0 ? (
              filteredActivities.map((activity) => (
                <TouchableOpacity
                  key={activity.name}
                  style={[
                    styles.activityChip,
                    selected.includes(activity.name) &&
                      styles.selectedActivityChip,
                  ]}
                  onPress={() => toggle(activity.name)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.activityText,
                      selected.includes(activity.name) &&
                        styles.selectedActivityText,
                    ]}
                  >
                    {activity.name}
                  </Text>
                  {selected.includes(activity.name) && (
                    <Ionicons
                      name='checkmark'
                      size={14}
                      color='#fff'
                      style={styles.checkIcon}
                    />
                  )}
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyState}>
                No activities match your search.
              </Text>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      {/* Save Button */}
      {loading ? (
        <ActivityIndicator style={{ marginVertical: 20 }} />
      ) : (
        <TouchableOpacity style={styles.saveButton} onPress={onSave}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },

  // ✅ Categories
  categoriesContainer: {
    paddingVertical: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fafafa',
  },
  categoryRows: {
    paddingHorizontal: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start', // Align items to the start
    flexWrap: 'nowrap', // Prevent wrapping
    marginBottom: 8,
  },
  horizontalScroll: {
    marginBottom: 8, // Add spacing between rows
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#f2f2f2',
    justifyContent: 'center',
    marginRight: 8, // Add spacing between chips
  },
  activeCategoryChip: {
    backgroundColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryChipText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  activeCategoryChipText: {
    color: '#fff',
    fontWeight: '700',
  },

  selectedCountRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  selectedCountText: {
    fontSize: 13,
    color: '#666',
  },

  // ✅ Activities
  activitiesScroll: { flex: 1, paddingHorizontal: 10, marginTop: 4 },
  activitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  activityChip: {
    backgroundColor: '#f7f7f7',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    margin: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedActivityChip: {
    backgroundColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    transform: [{ scale: 1.05 }],
  },
  activityText: { fontSize: 13, color: '#333' },
  selectedActivityText: { color: '#fff', fontWeight: '600' },
  checkIcon: { marginLeft: 5 },
  emptyState: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
    width: '100%',
  },

  // ✅ Button
  nextButton: {
    backgroundColor: '#007AFF',
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: 'center',
    margin: 16,
    shadowColor: '#007AFF',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterInput: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: 'center',
    margin: 16,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: 'red', textAlign: 'center', marginBottom: 10 },
});
