import React, { useMemo } from 'react';
import { View, StyleSheet, Image, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';

// Description: Minimalist marker pin with clean design and photo preview
export default function BlipMarker({ event, onPress }) {
  if (!event?.location) {
    return null;
  }

  const thumb = event?.imageUrl || event?.imageUri || null;
  const initial = useMemo(() => {
    const label = (event?.title || event?.interest || '').trim();
    return label ? label.charAt(0).toUpperCase() : '🎉';
  }, [event?.title, event?.interest]);

  // Check if event is happening now for visual indicator
  const isLive = useMemo(() => {
    const now = Date.now();
    let startMs = null;
    let endMs = null;

    const d = event?.date;
    if (d?.toDate) startMs = d.toDate().getTime();
    else if (typeof d?.seconds === 'number') startMs = d.seconds * 1000;
    else if (d instanceof Date) startMs = d.getTime();

    const e = event?.endAt;
    if (e?.toDate) endMs = e.toDate().getTime();
    else if (typeof e?.seconds === 'number') endMs = e.seconds * 1000;

    return startMs && now >= startMs && (!endMs || now < endMs);
  }, [event?.date, event?.endAt]);

  return (
    <Marker
      coordinate={event.location}
      onPress={() => onPress?.(event)}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
    >
      <View style={styles.container}>
        {/* Outer glow for live events */}
        {isLive && <View style={styles.liveGlow} />}

        {/* Main pin body */}
        <View style={styles.pinWrapper}>
          <LinearGradient
            colors={isLive ? ['#F59E0B', '#EF4444'] : ['#6366F1', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pinOuter}
          >
            <View style={styles.pinInner}>
              {thumb ? (
                <Image
                  source={{ uri: thumb }}
                  style={styles.thumbnail}
                  resizeMode='cover'
                />
              ) : (
                <View style={styles.fallbackContainer}>
                  <Text style={styles.fallbackText}>{initial}</Text>
                </View>
              )}
            </View>
          </LinearGradient>

          {/* Pin point */}
          <View style={styles.pinPoint} />
        </View>

        {/* Anchor shadow */}
        <View style={styles.shadow} />
      </View>
    </Marker>
  );
}

const PIN_SIZE = 50;
const INNER_SIZE = PIN_SIZE - 6;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: PIN_SIZE + 20,
    height: PIN_SIZE + 16,
  },
  liveGlow: {
    position: 'absolute',
    top: 0,
    width: PIN_SIZE + 16,
    height: PIN_SIZE + 16,
    borderRadius: (PIN_SIZE + 16) / 2,
    backgroundColor: '#F59E0B',
    opacity: 0.3,
  },
  pinWrapper: {
    alignItems: 'center',
  },
  pinOuter: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  pinInner: {
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#1F2937',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  fallbackContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#374151',
  },
  fallbackText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  pinPoint: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#6366F1',
    marginTop: -1,
  },
  shadow: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
