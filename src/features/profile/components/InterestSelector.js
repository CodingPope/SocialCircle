import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { db } from '../../../firebase/config';
import categoriesData from '../../events/constants/categoriesData.json';
import { useTheme } from '../../../theme';

const createStyles = (theme) => {
  const { colors, radii, spacing } = theme;
  return StyleSheet.create({
    searchBoxContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.neutral400,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      backgroundColor: colors.neutral100,
    },
    searchBox: {
      flex: 1,
      paddingVertical: spacing.sm,
      color: colors.neutral900,
    },
    clearButton: {
      padding: spacing.sm,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearButtonText: {
      color: colors.neutral800,
      fontWeight: 'bold',
    },
    interestSelector: { maxHeight: 200, marginBottom: spacing.xl },
    interestItem: {
      padding: spacing.md,
      borderRadius: radii.md,
      marginBottom: spacing.md,
      backgroundColor: colors.neutral200,
    },
    selectedInterest: { backgroundColor: colors.primary },
    interestText: { color: colors.neutral900 },
    selectedInterestText: { color: colors.neutral100 },
    noResultsText: {
      textAlign: 'center',
      color: colors.neutral600,
      marginVertical: spacing.md,
    },
  });
};

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
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      try {
        const allActivities = [];
        let usedSource = 'unknown';

        // Try Firestore first
        try {
          const categoriesSnapshot = await db.collection('categories').get();
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

      setFilteredActivities((prev) => {
        // Avoid churn if unchanged
        const same =
          prev.length === reordered.length &&
          prev.every((p, i) => p === reordered[i]);
        return same ? prev : reordered;
      });
    }, 250);
    return () => clearTimeout(delay);
  }, [
    effectiveSearch,
    JSON.stringify(activities),
    JSON.stringify(selectedInterests),
  ]);

  return (
    <View>
      <View style={styles.searchBoxContainer}>
        <TextInput
          style={styles.searchBox}
          placeholder='Search interests...'
          value={effectiveSearch}
          onChangeText={setEffectiveSearch}
          placeholderTextColor={theme.colors.neutral600}
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
        <ActivityIndicator size='large' color={theme.colors.primary} />
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
                style={[
                  styles.interestText,
                  selectedInterests.includes(activity) &&
                    styles.selectedInterestText,
                ]}
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

export default InterestSelector;
