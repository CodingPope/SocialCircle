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
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../../../../firebase/config';
import { useUserStore } from '../../../../profile';
import AnimatedGradientBackground from '../../../../../components/ui/AnimatedGradientBackground';
import {
  logOnboardingStepComplete,
  logOnboardingDone,
} from '../../../../../services/onboardingAnalytics';
import Button from '../../../../../components/ui/Button';
import { useTheme } from '../../../../../theme';

const createStyles = (theme) => {
  const { colors, radii, spacing } = theme;
  return StyleSheet.create({
    safe: { flex: 1 },
    contentContainer: { paddingBottom: 120 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md + 2,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.neutral100,
      textShadowColor: 'rgba(0,0,0,0.15)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    goBackButton: {
      marginRight: spacing.lg,
      padding: spacing.md,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: radii.md,
    },
    categoryRows: { paddingHorizontal: spacing.md },
    categoryRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      flexWrap: 'nowrap',
      marginBottom: spacing.sm,
    },
    horizontalScroll: { marginBottom: spacing.sm },
    categoryChip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md + 2,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(255,255,255,0.13)',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    activeCategoryChip: { backgroundColor: colors.neutral100 },
    categoryChipText: {
      fontSize: 14,
      color: colors.neutral100,
      fontWeight: '600',
      textShadowColor: 'rgba(0,0,0,0.1)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
    },
    activeCategoryChipText: {
      color: colors.secondary,
      fontWeight: '800',
      textShadowColor: 'rgba(0,0,0,0.05)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    selectedCountRow: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    selectedCountSummary: {
      fontSize: 14,
      color: colors.neutral100,
      fontWeight: '600',
      textShadowColor: 'rgba(0,0,0,0.1)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
    },
    activitiesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      paddingHorizontal: spacing.md,
      marginTop: spacing.xs,
    },
    activityChip: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: radii.pill,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      margin: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
    },
    selectedActivityChip: {
      backgroundColor: colors.neutral100,
      transform: [{ scale: 1.05 }],
    },
    activityText: {
      fontSize: 15,
      color: colors.neutral100,
      fontWeight: '600',
      textShadowColor: 'rgba(0,0,0,0.1)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
      flexShrink: 0,
    },
    selectedActivityText: {
      color: colors.secondary,
      fontWeight: '800',
      textShadowColor: 'rgba(118, 118, 118, 0.05)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
    },
    countDivider: {
      width: 1,
      height: '80%',
      backgroundColor: 'rgba(255,255,255,0.4)',
      marginHorizontal: spacing.sm,
    },
    countText: {
      fontSize: 15,
      color: colors.neutral100,
      fontWeight: '700',
      textAlign: 'center',
      textShadowColor: 'rgba(0,0,0,0.1)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
      flexShrink: 0,
    },
    selectedCountText: {
      color: colors.secondary,
      textShadowColor: 'rgba(0,0,0,0.05)',
    },
    checkIcon: {
      marginLeft: spacing.sm,
      backgroundColor: 'rgba(255,255,255,0.3)',
      borderRadius: 10,
      width: 20,
      height: 20,
      textAlign: 'center',
      textAlignVertical: 'center',
    },
    emptyState: {
      fontSize: 15,
      color: colors.neutral100,
      textAlign: 'center',
      marginTop: spacing.lg,
      width: '100%',
      fontWeight: '600',
      textShadowColor: 'rgba(0,0,0,0.1)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
    },
    stickyFooterContainer: {
      position: 'absolute',
      bottom: 1,
      left: 0,
      right: 0,
      zIndex: 20,
      alignItems: 'center',
    },
    stickyFooterBlur: {
      width: '100%',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.06)',
      backgroundColor: theme.isDark
        ? 'rgba(10,14,20,0.32)'
        : 'rgba(255,255,255,0.72)',
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      overflow: 'hidden',
      alignItems: 'center',
    },
    stickyFooterContent: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    selectedCountBadge: {
      backgroundColor: theme.isDark
        ? 'rgba(198, 198, 198, 0.41)'
        : 'rgba(0, 0, 0, 0.4)',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      marginBottom: 0,
    },
    selectedCountBadgeText: {
      fontSize: 14,
      color: colors.neutral100,
      fontWeight: '700',
      textShadowColor: 'rgba(0,0,0,0.1)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
    },
    footerButton: {
      width: '100%',
    },
    error: {
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.sm,
      backgroundColor: 'rgba(220,38,38,0.15)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      width: '100%',
      fontWeight: '600',
    },
    sectionLabel: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.neutral100,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
      textShadowColor: 'rgba(0,0,0,0.1)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 1,
    },
    filterInput: {
      marginHorizontal: spacing.lg,
      marginVertical: spacing.sm,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.45)',
      borderRadius: radii.md,
      backgroundColor: 'rgba(255,255,255,0.13)',
      color: colors.neutral100,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.neutral400,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      backgroundColor: colors.neutral100,
    },
    searchInput: {
      flex: 1,
      paddingVertical: spacing.sm,
      color: colors.neutral900,
    },
    interestSelector: { maxHeight: 200, marginBottom: spacing.xl },
    interestItem: {
      padding: spacing.md,
      borderRadius: radii.md,
      marginBottom: spacing.md,
      backgroundColor: colors.neutral200,
    },
  });
};

function InterestsScreen({ navigation }) {
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
    const fetchCategories = async () => {
      try {
        const categorySnap = await db.collection('categories').get();
        let userSnap = null;
        try {
          userSnap = await db.collection('users').get();
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
      await db
        .collection('users')
        .doc(user.uid)
        .update({ interests: selected });

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
    <AnimatedGradientBackground style={styles.safe} variant='onboarding'>
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
              ? 'Filter All Activities | People in Interest'
              : `Choose Activities in ${
                  categories.find((c) => c.id === activeCategory)?.name || ''
                } | People in Interest`}
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
          </Animated.View>
        </ScrollView>

        {/* Sticky Footer (frosted) */}
        <View style={styles.stickyFooterContainer} pointerEvents='box-none'>
          <BlurView
            intensity={30}
            tint={theme.isDark ? 'dark' : 'light'}
            style={styles.stickyFooterBlur}
          >
            <View style={styles.stickyFooterContent}>
              <View style={styles.selectedCountBadge}>
                <Text style={styles.selectedCountBadgeText}>
                  {selected.length} Selected
                </Text>
              </View>

              <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </View>

              <View style={{ width: 140 }}>
                {loading ? (
                  <ActivityIndicator
                    style={{ marginVertical: theme.spacing.sm }}
                    color={theme.colors.neutral100}
                  />
                ) : (
                  <Button
                    title='Next'
                    onPress={onNext}
                    style={styles.footerButton}
                  />
                )}
              </View>
            </View>
          </BlurView>
        </View>
      </SafeAreaView>
    </AnimatedGradientBackground>
  );
}

export default InterestsScreen;
