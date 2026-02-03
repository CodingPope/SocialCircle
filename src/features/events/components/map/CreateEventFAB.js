/**
 * CreateEventFAB - Floating action button for creating events
 * Extracted from MapScreen for cleaner organization
 */
import React, { forwardRef } from 'react';
import { TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const CreateEventFAB = forwardRef(function CreateEventFAB(
  { onPress, onLayout, bottomInset = 0, theme, style },
  ref,
) {
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      style={[styles.container, { bottom: 110 + bottomInset }, style]}
    >
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={onPress}
        accessibilityLabel='Create event'
        accessibilityRole='button'
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name='add' size={32} color='#fff' />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    zIndex: 100,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});

export default CreateEventFAB;
