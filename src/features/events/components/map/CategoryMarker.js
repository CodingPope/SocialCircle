// Description: Custom map marker component with category emoji and attendee count
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { getCategoryConfig } from '../../constants/categoryPins';

// Marker sizes optimized for different zoom levels
// At typical city zoom (12-14), 40px is comfortable
// These sizes follow Material Design and iOS HIG guidelines for touch targets
const MARKER_SIZE = 40; // Base size for the circular pin
const EMOJI_SIZE = 18; // Emoji size for readability
const BADGE_SIZE = 20; // Attendee badge size
const BORDER_WIDTH = 2.5; // Border for visual separation

export const CategoryMarker = ({ event, onPress, borderColor = '#fff' }) => {
  // Handle cases where location might not exist
  if (!event?.location) {
    console.warn('[CategoryMarker] Event has no location:', event?.id);
    return null;
  }

  const categoryConfig = getCategoryConfig(event);
  const attendeeCount = event.attendees?.length || 0;
  const hasMultipleCategories = event.categories?.length > 1;

  return (
    <Marker
      coordinate={event.location}
      onPress={() => onPress?.(event)}
      tracksViewChanges={false} // Performance optimization
      anchor={{ x: 0.5, y: 0.5 }} // Center anchor for better positioning
    >
      <View style={styles.markerContainer}>
        {/* Main pin with emoji */}
        <View
          style={[
            styles.pinBody,
            { backgroundColor: categoryConfig.color, borderColor },
          ]}
        >
          <Text style={styles.emoji}>{categoryConfig.emoji}</Text>

          {/* Attendee count badge (only if > 0) */}
          {attendeeCount > 0 && (
            <View style={styles.attendeeBadge}>
              <Text style={styles.attendeeText}>{attendeeCount}</Text>
            </View>
          )}

          {/* Multi-category indicator dot */}
          {hasMultipleCategories && <View style={styles.multiDot} />}
        </View>
      </View>
    </Marker>
  );
};

const styles = StyleSheet.create({
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBody: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: BORDER_WIDTH,
    // borderColor now set dynamically via prop
    alignItems: 'center',
    justifyContent: 'center',
    // Enhanced shadow for better visibility at all zoom levels
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3.5,
    elevation: 6,
  },
  emoji: {
    fontSize: EMOJI_SIZE,
    lineHeight: EMOJI_SIZE + 2, // Better vertical centering
  },
  attendeeBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF4444',
    borderRadius: BADGE_SIZE / 2,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.3,
    shadowRadius: 2.5,
    elevation: 5,
  },
  attendeeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  multiDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#333',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
