import React, { useState, useEffect, useMemo } from 'react';
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
} from '../../../firebase/firestoreCompat';
import { db } from '../../../firebase/config';
import { useUserStore } from '../stores/userStore';
import Button from '../../../components/ui/Button';
import AnimatedGradientBackground from '../../../components/ui/AnimatedGradientBackground';
import { useTheme } from '../../../theme';
import categoriesData from '../../events/constants/categoriesData.json';

const createStyles = (theme) => {
  const { colors, radii, spacing } = theme;
  const accent = '#007AFF';
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255,255,255,0.2)',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
    sectionLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: '#fff',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    categoriesContainer: {
      paddingVertical: 1,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255,255,255,0.25)',
    },
    horizontalScroll: { marginBottom: spacing.sm },
    categoryRows: {
      paddingHorizontal: spacing.md,
    },
    categoryRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      flexWrap: 'nowrap',
      marginBottom: spacing.sm,
    },
    categoryChip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    activeCategoryChip: {
      backgroundColor: accent,
      shadowColor: accent,
      shadowOpacity: 0.35,
      shadowRadius: 4,
      elevation: 3,
    },
    categoryChipText: {
      fontSize: 13,
      color: '#f8fafc',
      fontWeight: '500',
    },
    activeCategoryChipText: {
      color: '#fff',
      fontWeight: '700',
    },
    filterInput: {
      marginHorizontal: spacing.lg,
      marginVertical: spacing.sm,
      padding: spacing.md,
      borderWidth: 0,
      borderRadius: radii.md,
      backgroundColor: 'rgba(255,255,255,0.9)',
      color: colors.neutral900,
    },
    selectedCountRow: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    selectedCountText: {
      fontSize: 13,
      color: '#f8f9ff',
    },
    activitiesScroll: {
      flex: 1,
      paddingHorizontal: spacing.md,
      marginTop: spacing.xs,
    },
    activitiesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
    },
    activityChip: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: radii.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      margin: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
    },
    selectedActivityChip: {
      backgroundColor: accent,
      shadowColor: accent,
      shadowOpacity: 0.2,
      shadowRadius: 3,
      transform: [{ scale: 1.03 }],
    },
    activityText: { fontSize: 13, color: '#f8fafc' },
    selectedActivityText: { color: '#fff', fontWeight: '600' },
    checkIcon: { marginLeft: spacing.sm, color: '#fff' },
    emptyState: {
      fontSize: 14,
      color: '#fff',
      textAlign: 'center',
      marginTop: spacing.lg,
      width: '100%',
    },
    saveButtonWrapper: {
      margin: spacing.lg,
    },
    error: {
      color: '#FFE4E6',
      textAlign: 'center',
      marginBottom: spacing.sm,
      backgroundColor: 'rgba(255,74,74,0.25)',
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
    },
    countDivider: {
      width: 1,
      height: 12,
      backgroundColor: 'rgba(255,255,255,0.4)',
      marginHorizontal: spacing.xs,
    },
    countText: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.7)',
      fontWeight: '500',
    },
    selectedCountText: {
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '600',
    },
  });
};

export default function ManageInterestsScreen({ navigation }) {
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [filterText, setFilterText] = useState('');
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    const fetchCategoriesAndUserInterests = async () => {
      try {
        // Description: Helper to normalize interest names for deduplication
        const normalizeInterest = (name) => {
          return name.toLowerCase().trim().replace(/\s+/g, ' ');
        };

        // Description: Extract count from interest object checking multiple fields
        const getInterestCount = (interest) => {
          if (typeof interest === 'string') return 0;
          return (
            interest.count_selected ||
            interest.count ||
            interest.count_event_matches ||
            interest.count_event_views ||
            interest.count_event_joins ||
            0
          );
        };

        // Fetch categories (fall back to bundled data if Firestore is empty/unavailable)
        let fetchedCategories = [];
        try {
          const snapshot = await getDocs(collection(db, 'categories'));
          fetchedCategories = snapshot.docs.map((categoryDoc) => ({
            id: categoryDoc.id,
            name: categoryDoc.data().name,
            interests: categoryDoc.data().interests || [],
          }));
        } catch (fetchErr) {
          console.warn('Failed to fetch categories from Firestore', fetchErr);
        }

        if (!fetchedCategories.length) {
          fetchedCategories = (categoriesData || []).map((category) => ({
            id: category.id,
            name: category.name,
            interests: Array.isArray(category.interests)
              ? category.interests.map((interest) => ({ ...interest }))
              : [],
          }));
        }

        // Description: Track unique interests with counts for deduplication
        const interestMap = new Map();
        const interestOrder = [];

        fetchedCategories.forEach((category) => {
          category.interests.forEach((interest) => {
            const interestName =
              typeof interest === 'string' ? interest : interest.name;
            const normalized = normalizeInterest(interestName);

            if (!interestMap.has(normalized)) {
              const count = getInterestCount(interest);
              interestMap.set(normalized, { name: interestName, count });
              interestOrder.push({ name: interestName, count });
            }
          });
        });

        // Description: Create Popular category with top 30 interests sorted by count
        const POPULAR_LIMIT = 30;
        const filteredBaseCategories = fetchedCategories.filter(
          (cat) => cat.id !== 'all' && cat.id !== 'popular'
        );

        const sortedPopular = interestOrder
          .sort((a, b) => b.count - a.count)
          .slice(0, POPULAR_LIMIT);

        const popularCategory = {
          id: 'popular',
          name: 'Popular',
          interests: sortedPopular,
        };

        // Description: Build final category list with Popular first, then All
        const allInterests = Array.from(interestMap.values());
        const allCategory = {
          id: 'all',
          name: 'All',
          interests: allInterests,
        };

        const categoriesWithSpecials = [
          popularCategory,
          allCategory,
          ...filteredBaseCategories,
        ];
        setCategories(categoriesWithSpecials);

        // Fetch user's selected interests
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists) {
          const userData = userDoc.data();
          setSelected(userData.interests || []); // Prepopulate selected interests
        }

        setActiveCategory('popular');
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
    <AnimatedGradientBackground variant='profile' style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name='arrow-back' size={24} color='#fff' />
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
            placeholderTextColor={theme.colors.neutral600}
          />
        )}

        {/* Selected Count */}
        <View style={styles.selectedCountRow}>
          <Text style={styles.selectedCountText}>
            {selected.length} Selected
          </Text>
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
                    {(activity.count || 0) > 0 && (
                      <>
                        <View style={styles.countDivider} />
                        <Text
                          style={[
                            styles.countText,
                            selected.includes(activity.name) &&
                              styles.selectedCountText,
                          ]}
                        >
                          {activity.count}
                        </Text>
                      </>
                    )}
                    {selected.includes(activity.name) && (
                      <Ionicons
                        name='checkmark'
                        size={14}
                        color={theme.colors.neutral100}
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
          <ActivityIndicator
            style={{ marginVertical: theme.spacing.lg }}
            color='#ff6b6b'
          />
        ) : (
          <View style={styles.saveButtonWrapper}>
            <Button title='Save' onPress={onSave} />
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </SafeAreaView>
    </AnimatedGradientBackground>
  );
}
