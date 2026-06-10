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
import { db } from '../../../services/firebase';
import categoriesData from '../../events/constants/categoriesData.json';
import { useTheme } from '../../../theme';

// Description: Flatten a categories array (Firestore docs and the bundled JSON
// share the same shape) into a sorted, de-duplicated list of activity names.
const extractActivityNames = (categories) => {
  const names = [];
  (Array.isArray(categories) ? categories : []).forEach((cat) => {
    const interests = cat?.interests || [];
    if (!Array.isArray(interests)) return;
    interests.forEach((interest) => {
      if (!interest) return;
      if (typeof interest === 'string') names.push(interest);
      else if (typeof interest.name === 'string') names.push(interest.name);
    });
  });
  return [...new Set(names.map((a) => (a || '').trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })
  );
};

// Bundled interests ship with the app, so the picker renders instantly and never
// hangs on a stalled native Firestore request (root cause of the Android filter bug).
const BUNDLED_ACTIVITIES = extractActivityNames(categoriesData);

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

  const [activities, setActivities] = useState(BUNDLED_ACTIVITIES);
  const [filteredActivities, setFilteredActivities] =
    useState(BUNDLED_ACTIVITIES);
  const [loading, setLoading] = useState(BUNDLED_ACTIVITIES.length === 0);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const keyboardAppearance = theme.isDark ? 'dark' : 'light';

  // Refresh from Firestore in the background. The bundled list is already
  // rendered, so a slow or stalled native .get() (observed on Android in the
  // filter sheet) can never block the UI — it is raced against a timeout and any
  // failure simply keeps the bundled data.
  useEffect(() => {
    let cancelled = false;
    const refreshFromFirestore = async () => {
      try {
        const snapshot = await Promise.race([
          db.collection('categories').get(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('categories-fetch-timeout')),
              4000
            )
          ),
        ]);
        if (cancelled || !snapshot?.docs?.length) return;
        const fromFirestore = extractActivityNames(
          snapshot.docs.map((d) => d.data() || {})
        );
        if (fromFirestore.length) {
          setActivities(fromFirestore);
        }
      } catch (err) {
        // Expected when offline or when the native Firestore channel stalls;
        // the bundled list stays visible.
        console.debug(
          '[InterestSelector] categories refresh skipped:',
          err?.message || err
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    refreshFromFirestore();
    return () => {
      cancelled = true;
    };
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
          keyboardAppearance={keyboardAppearance}
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
