/**
 * MapTutorialOverlay - First-time tutorial overlay for map screen
 * Displays hints for create button and filter button
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';

export default function MapTutorialOverlay({
  visible,
  highlightStyle,
  tooltipPosition,
  copy,
  opacity,
  onDismiss,
}) {
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents='auto'>
      <Animated.View style={[styles.backdrop, { opacity }]} />

      {highlightStyle && (
        <View pointerEvents='none' style={[styles.highlight, highlightStyle]} />
      )}

      {tooltipPosition && copy && (
        <Animated.View
          style={[styles.tooltip, tooltipPosition, { opacity }]}
          accessibilityLabel={`${copy.title} tutorial tooltip`}
        >
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.description}>{copy.description}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={onDismiss}
            accessibilityRole='button'
            accessibilityLabel={`${copy.cta}, close tutorial`}
          >
            <Text style={styles.buttonText}>{copy.cta}</Text>
          </TouchableOpacity>
        </Animated.View>
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
