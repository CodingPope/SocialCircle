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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../context/AuthContext';

export default function InterestsScreen({ navigation }) {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [filterText, setFilterText] = useState(''); // State for filtering activities

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'categories'));
        const fetchedCategories = [
          { id: 'all', name: 'All', activities: [] }, // Add "All" category
        ];

        for (const categoryDoc of snapshot.docs) {
          const activitiesSnapshot = await getDocs(
            collection(db, `categories/${categoryDoc.id}/activities`)
          );
          fetchedCategories.push({
            id: categoryDoc.id,
            name: categoryDoc.data().name,
            activities: activitiesSnapshot.docs.map((doc) => ({
              id: doc.id,
              name: doc.data().name,
            })),
          });
        }

        setCategories(fetchedCategories);
        setActiveCategory(fetchedCategories[0]?.id || '');
        fadeIn();
      } catch (e) {
        console.error(e);
        setError('Failed to load categories.');
      }
    };

    fetchCategories();
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

  const onNext = async () => {
    setLoading(true);
    try {
      if (selected.length > 30) {
        setError('You can select up to 30 interests only.');
        setLoading(false);
        return;
      }
      await updateDoc(doc(db, 'users', user.uid), { interests: selected });
      navigation.replace('Location');
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
            categories.flatMap((cat) => cat.activities).map((a) => [a.id, a]) // Deduplicate by `id`
          ).values()
        )
      : categories.find((cat) => cat.id === activeCategory)?.activities || [];

  const filteredActivities = currentActivities.filter((activity) =>
    activity.name.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* ✅ Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
        ></TouchableOpacity>
        <Text style={styles.headerTitle}>Choose Your Interests</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* ✅ Category Label */}
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
                <View key={rowIndex} style={styles.categoryRow}>
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
                          if (cat.id !== 'all') setFilterText(''); // Clear filter when switching from "All"
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
      {/* ✅ Activities Label */}
      <Text style={styles.sectionLabel}>
        {activeCategory === 'all'
          ? 'Filter All Activities'
          : `Choose Activities in ${
              categories.find((c) => c.id === activeCategory)?.name || ''
            }`}
      </Text>

      {/* ✅ Filter Textbox */}
      {activeCategory === 'all' && (
        <TextInput
          style={styles.filterInput}
          placeholder='Search activities...'
          value={filterText}
          onChangeText={setFilterText}
        />
      )}

      {/* ✅ Selected Count */}
      <View style={styles.selectedCountRow}>
        <Text style={styles.selectedCountText}>{selected.length} Selected</Text>
      </View>

      {/* ✅ Activities */}
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
        }}
      >
        <ScrollView style={styles.activitiesScroll}>
          <View style={styles.activitiesGrid}>
            {filteredActivities.length > 0 ? (
              filteredActivities.map((activity) => (
                <TouchableOpacity
                  key={activity.id}
                  style={[
                    styles.activityChip,
                    selected.includes(activity.id) &&
                      styles.selectedActivityChip,
                  ]}
                  onPress={() => toggle(activity.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.activityText,
                      selected.includes(activity.id) &&
                        styles.selectedActivityText,
                    ]}
                  >
                    {activity.name}
                  </Text>
                  {selected.includes(activity.id) && (
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

      {/* ✅ Button */}
      {loading ? (
        <ActivityIndicator style={{ marginVertical: 20 }} />
      ) : (
        <TouchableOpacity style={styles.nextButton} onPress={onNext}>
          <Text style={styles.nextButtonText}>Next</Text>
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
});
