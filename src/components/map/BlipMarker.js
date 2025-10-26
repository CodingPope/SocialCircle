import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';

// Description: Red circular blip marker. Keeps API minimal for future extensibility.
export default function BlipMarker({ event, onPress, borderColor = '#fff' }) {
  if (!event?.location) {
    return null;
  }

  return (
    <Marker coordinate={event.location} onPress={() => onPress?.(event)}>
      <View style={[styles.blip, { borderColor }]} />
    </Marker>
  );
}

const styles = StyleSheet.create({
  blip: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E74C3C',
    borderWidth: 2,
    // borderColor now set dynamically via prop
  },
});
