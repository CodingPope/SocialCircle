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
import { db } from '../../../../firebase/config';
import { useUserStore } from '../../../../features/profile/userStore';
import AnimatedGradientBackground from '../../../../components/ui/AnimatedGradientBackground';
import {
  logOnboardingStepComplete,
  logOnboardingDone,
} from '../../../../services/onboardingAnalytics';

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
        const snapshot = await getDocs(collection(db, 'categories'));
        const fetchedCategories = snapshot.docs.map((categoryDoc) => ({
          id: categoryDoc.id,
          name: categoryDoc.data().name,
          interests: categoryDoc.data().interests || [],
        }));

        const allInterests = fetchedCategories.flatMap((cat) => cat.interests);
        fetchedCategories.unshift({
          id: 'all',
          name: 'All',
          interests: allInterests,
        });

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
      await updateDoc(doc(db, 'users', user.uid), { interests: selected });
      await logOnboardingStepComplete('interests', {
        selected_count: selected.length,
      });
      await logOnboardingDone({ source: 'core_onboarding' });
      useUserStore.getState().setProfileComplete(true);
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
            categories.flatMap((cat) => cat.interests).map((a) => [a.name, a])
          ).values()
        )
      : categories.find((cat) => cat.id === activeCategory)?.interests || [];

  const filteredActivities = currentActivities.filter((activity) =>
    activity.name.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <AnimatedGradientBackground style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
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

          <View style={styles.selectedCountRow}>
            <Text style={styles.selectedCountText}>
              {selected.length} Selected
            </Text>
          </View>

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

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color='#fff' />
          ) : (
            <TouchableOpacity style={styles.nextButton} onPress={onNext}>
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </AnimatedGradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  contentContainer: { paddingBottom: 24 },
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
    color: '#222',
    textShadowColor: 'rgba(255,255,255,0.25)',
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
    color: '#222',
    fontWeight: '600',
    textShadowColor: 'rgba(255,255,255,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  activeCategoryChipText: {
    color: '#ff6b6b',
    fontWeight: '800',
    textShadowColor: 'rgba(255,255,255,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  selectedCountRow: { paddingHorizontal: 16, paddingTop: 8 },
  selectedCountText: {
    fontSize: 14,
    color: '#222',
    fontWeight: '600',
    textShadowColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14,
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
    color: '#222',
    fontWeight: '600',
    textShadowColor: 'rgba(255,255,255,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  selectedActivityText: {
    color: '#ff6b6b',
    fontWeight: '800',
    textShadowColor: 'rgba(255,255,255,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  checkIcon: { marginLeft: 5 },
  emptyState: {
    fontSize: 15,
    color: '#222',
    textAlign: 'center',
    marginTop: 20,
    width: '100%',
    fontWeight: '600',
    textShadowColor: 'rgba(255,255,255,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  nextButton: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: 'center',
    margin: 16,
  },
  nextButtonText: {
    color: '#222',
    fontSize: 17,
    fontWeight: '700',
    textShadowColor: 'rgba(255,255,255,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  error: { color: 'red', textAlign: 'center', marginBottom: 10 },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    textShadowColor: 'rgba(255,255,255,0.18)',
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
