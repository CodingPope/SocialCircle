/**
 * MapQuickDateFilters - Quick date filter chip bar for map
 * Allows quick selection of Today/Tomorrow/This Week
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';

// Description: Quick date filter presets
const QUICK_DATE_FILTERS = [
  { key: 'today', label: 'Today', startOffset: 0, endOffset: 0 },
  { key: 'tomorrow', label: 'Tomorrow', startOffset: 1, endOffset: 1 },
  { key: 'week', label: 'This Week', startOffset: 0, endOffset: 6 },
];

export default function MapQuickDateFilters({
  selectedKey,
  onSelect,
  onClear,
  theme,
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handlePress = (filter) => {
    if (selectedKey === filter.key) {
      onClear?.();
    } else {
      onSelect?.(filter);
    }
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {QUICK_DATE_FILTERS.map((filter) => {
        const isActive = selectedKey === filter.key;
        return (
          <TouchableOpacity
            key={filter.key}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => handlePress(filter)}
            accessibilityRole='button'
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Filter by ${filter.label}`}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// Export for use in MapScreen
export { QUICK_DATE_FILTERS };

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    chipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.colors.text,
    },
    chipTextActive: {
      color: '#fff',
    },
  });
