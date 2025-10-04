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
import { db } from '../../../../../firebase/config';
import { useUserStore } from '../../../../profile';
import AnimatedGradientBackground from '../../../../../components/ui/AnimatedGradientBackground';
import {
  logOnboardingStepComplete,
  logOnboardingDone,
} from '../../../../../services/onboardingAnalytics';

function InterestsScreen({ navigation }) {
  const user = useUserStore((state) => state.user);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const categorySnap = await getDocs(collection(db, 'categories'));
        let userSnap = null;
        try {
          userSnap = await getDocs(collection(db, 'users'));
        } catch (countErr) {
          console.warn('Failed to load interest adoption counts', countErr);
        }

        const counts = {};
        if (userSnap) {
          userSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const interests = Array.isArray(data.interests)
              ? data.interests
              : [];
            interests.forEach((interest) => {
              const key = String(interest || '').trim();
              if (!key) return;
              counts[key] = (counts[key] || 0) + 1;
            });
          });
        }

        const interestMap = new Map();
        const interestOrder = [];
        const orderIndex = new Map();
        const normalizeInterest = (interest) => {
          if (!interest) return null;
          if (typeof interest === 'string') {
            const name = interest.trim();
            if (!name) return null;
            const item = { name, count: counts[name] || 0 };
            if (!interestMap.has(name)) {
              interestMap.set(name, item);
              interestOrder.push(name);
              orderIndex.set(name, interestOrder.length - 1);
            }
            return { ...item };
          }
          const name = String(interest.name || '').trim();
          if (!name) return null;
          const item = {
            ...interest,
            name,
            count: counts[name] || 0,
          };
          if (!interestMap.has(name)) {
            interestMap.set(name, item);
            interestOrder.push(name);
            orderIndex.set(name, interestOrder.length - 1);
          }
          return { ...item };
        };

        const baseCategories = categorySnap.docs.map((categoryDoc) => {
          const data = categoryDoc.data() || {};
          const normalizedInterests = Array.isArray(data.interests)
            ? data.interests
                .map((interest) => normalizeInterest(interest))
                .filter(Boolean)
            : [];
          return {
            id: categoryDoc.id,
            name: data.name || categoryDoc.id,
            interests: normalizedInterests,
          };
        });

        const filteredBaseCategories = baseCategories.filter((category) => {
          const id = String(category.id || '').toLowerCase();
          const name = String(category.name || '').toLowerCase();
          return (
            id !== 'all' &&
            id !== 'popular' &&
            name !== 'all' &&
            name !== 'popular'
          );
        });

        const uniqueInterests = interestOrder
          .map((name) => interestMap.get(name))
          .filter(Boolean);

        const allCategory = {
          id: 'all',
          name: 'All',
          interests: uniqueInterests,
        };

        const sortedPopular = [...uniqueInterests].sort((a, b) => {
          const diff = (b.count || 0) - (a.count || 0);
          if (diff !== 0) return diff;
          const aIndex = orderIndex.get(a.name) ?? 0;
          const bIndex = orderIndex.get(b.name) ?? 0;
          return aIndex - bIndex;
        });

        const POPULAR_LIMIT = 30;
        const withActivity = sortedPopular.filter(
          (item) => (item.count || 0) > 0
        );
        const popularInterests =
          withActivity.length >= POPULAR_LIMIT
            ? withActivity.slice(0, POPULAR_LIMIT)
            : sortedPopular.slice(0, POPULAR_LIMIT);

        const popularCategory =
          popularInterests.length > 0
            ? { id: 'popular', name: 'Popular', interests: popularInterests }
            : null;

        const categoriesWithSpecials = [
          ...(popularCategory ? [popularCategory] : []),
          allCategory,
          ...filteredBaseCategories,
        ];

        setCategories(categoriesWithSpecials);
        setActiveCategory(popularCategory ? 'popular' : 'all');
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
      if (selected.length === 0) {
        setError('Please select at least 1 interest to continue.');
        setLoading(false);
        return;
      }
      if (selected.length > 30) {
        setError('You can select up to 30 interests only.');
        setLoading(false);
        return;
      }
      // Update Firestore and local user store
      await updateDoc(doc(db, 'users', user.uid), { interests: selected });

      // Update the user store with new interests immediately
      useUserStore.getState().setUser({ ...user, interests: selected });

      await logOnboardingStepComplete('interests', {
        selected_count: selected.length,
      });

      // Check if there are more onboarding steps after interests
      const {
        getNextOnboardingStep,
      } = require('../../../../../utils/onboardingRouter');
      const updatedUserData = { ...user, interests: selected };
      const nextStep = getNextOnboardingStep(updatedUserData);

      if (nextStep) {
        // More steps remaining, navigate to the next one
        navigation.navigate(nextStep);
      } else {
        // Onboarding complete, mark profile as complete
        await logOnboardingDone({ source: 'core_onboarding' });
        useUserStore.getState().setProfileComplete(true);
        // The AppNavigator will automatically switch to main app when profileComplete becomes true
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const currentActivities =
    categories.find((cat) => cat.id === activeCategory)?.interests || [];

  const filteredActivities = currentActivities.filter((activity) =>
    activity.name.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <AnimatedGradientBackground style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          style={{ flex: 1 }}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate('SexScreen');
                }
              }}
              style={styles.goBackButton}
            >
              <Ionicons name='arrow-back' size={24} color='#fff' />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Choose Your Interests</Text>
            <View style={{ width: 24 }} />
          </View>

          <Text style={styles.sectionLabel}>Select a Category</Text>
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

          <Text style={styles.sectionLabel}>
            {activeCategory === 'all'
              ? 'Filter All Activities'
              : `Choose Activities in ${
                  categories.find((c) => c.id === activeCategory)?.name || ''
                }`}
          </Text>

          {activeCategory === 'all' && (
            <TextInput
              style={styles.filterInput}
              placeholder='Search activities...'
              placeholderTextColor='rgba(255,255,255,0.6)'
              value={filterText}
              onChangeText={setFilterText}
            />
          )}

          <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
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
                        color='#ff6b6b'
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
          </Animated.View>
        </ScrollView>

        {/* Sticky Footer */}
        <View style={styles.stickyFooter}>
          <View style={styles.selectedCountBadge}>
            <Text style={styles.selectedCountBadgeText}>
              {selected.length} Selected
            </Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? (
            <ActivityIndicator style={{ marginVertical: 10 }} color='#fff' />
          ) : (
            <TouchableOpacity style={styles.nextButton} onPress={onNext}>
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </AnimatedGradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  contentContainer: { paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  goBackButton: {
    marginRight: 16,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
  },
  categoryRows: { paddingHorizontal: 10 },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    marginBottom: 8,
  },
  horizontalScroll: { marginBottom: 8 },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.13)',
    justifyContent: 'center',
    marginRight: 8,
  },
  activeCategoryChip: { backgroundColor: '#fff' },
  categoryChipText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  activeCategoryChipText: {
    color: '#ff6b6b',
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.05)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  selectedCountRow: { paddingHorizontal: 16, paddingTop: 8 },
  selectedCountText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  activitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    marginTop: 4,
  },
  activityChip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    margin: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedActivityChip: {
    backgroundColor: '#fff',
    transform: [{ scale: 1.05 }],
  },
  activityText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    flexShrink: 0,
  },
  selectedActivityText: {
    color: '#ff6b6b',
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.05)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  countDivider: {
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginHorizontal: 8,
  },
  countText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    flexShrink: 0,
  },
  selectedCountText: {
    color: '#ff6b6b',
    textShadowColor: 'rgba(0,0,0,0.05)',
  },
  checkIcon: {
    marginLeft: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10,
    width: 20,
    height: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyState: {
    fontSize: 15,
    color: '#fff',
    textAlign: 'center',
    marginTop: 20,
    width: '100%',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(168, 166, 166, 0.35)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    backdropFilter: 'blur(40px)',
  },
  selectedCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  selectedCountBadgeText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  nextButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    marginBottom: 26,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  error: {
    color: '#FF4A4A',
    textAlign: 'center',
    marginBottom: 10,
    backgroundColor: 'rgba(255,74,74,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    width: '100%',
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  filterInput: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.13)',
    color: '#fff',
  },
});

export default InterestsScreen;
