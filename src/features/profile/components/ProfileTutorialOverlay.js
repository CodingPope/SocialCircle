/**
 * ProfileTutorialOverlay - First-time tutorial overlay for profile screen
 * Extracted from ProfileScreen for cleaner code organization
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function ProfileTutorialOverlay({
  highlightStyle,
  tooltipPosition,
  onDismiss,
}) {
  return (
    <View style={styles.overlay} pointerEvents='auto'>
      <View style={styles.backdrop} />

      {highlightStyle && (
        <View pointerEvents='none' style={[styles.highlight, highlightStyle]} />
      )}

      {tooltipPosition && (
        <View
          style={[styles.tooltip, tooltipPosition]}
          accessibilityLabel='Profile tutorial tooltip'
        >
          <Text style={styles.title}>Profile menu</Text>
          <Text style={styles.description}>
            Open the menu to add a profile photo, edit your bio, and manage your
            account details.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={onDismiss}
            accessibilityRole='button'
            accessibilityLabel='Got it, close profile tutorial'
          >
            <Text style={styles.buttonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  highlight: {
    position: 'absolute',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tooltip: {
    position: 'absolute',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#101824',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  description: {
    color: '#e5edff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#3A7BFF',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
