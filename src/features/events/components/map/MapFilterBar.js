// Description: Category filter bar for map screen with emoji chips
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { CATEGORY_PINS } from '../../constants/categoryPins';

export const MapFilterBar = ({
  activeFilters = [],
  onToggleFilter,
  userCategories = [],
}) => {
  const isAllActive = activeFilters.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* "All" filter chip */}
        <TouchableOpacity
          style={[
            styles.chip,
            isAllActive && styles.chipActive,
            isAllActive && { backgroundColor: '#4CAF50' },
          ]}
          onPress={() => onToggleFilter(null)} // null = clear all filters
        >
          <Text style={styles.emoji}>🌍</Text>
          <Text style={[styles.chipText, isAllActive && styles.chipTextActive]}>
            All
          </Text>
        </TouchableOpacity>

        {/* Category filter chips (only user's categories) */}
        {userCategories.map((categoryId) => {
          const config = CATEGORY_PINS[categoryId];
          if (!config) return null;

          const isActive = activeFilters.includes(categoryId);

          return (
            <TouchableOpacity
              key={categoryId}
              style={[
                styles.chip,
                { borderColor: config.color },
                isActive && styles.chipActive,
                isActive && { backgroundColor: config.color },
              ]}
              onPress={() => onToggleFilter(categoryId)}
            >
              <Text style={styles.emoji}>{config.emoji}</Text>
              <Text
                style={[styles.chipText, isActive && styles.chipTextActive]}
              >
                {config.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#4CAF50',
    backgroundColor: '#fff',
    gap: 6,
  },
  chipActive: {
    // backgroundColor set dynamically per category color
  },
  emoji: {
    fontSize: 16,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  chipTextActive: {
    color: '#fff',
  },
});
