import React, { useEffect } from 'react';
import { View, StyleSheet, Image, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

export default function LoadingOverlay({ visible }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = visible
      ? withTiming(1, { duration: 350 })
      : withTiming(0, { duration: 250 });
  }, [visible]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.overlay, fadeStyle]}
      pointerEvents='auto'
      accessibilityRole='alert'
      accessible
    >
      <View style={styles.backdrop} />
      <View style={styles.iconCard}>
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.iconImage}
          resizeMode='contain'
          accessibilityLabel='App loading'
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,12,20,0.72)',
  },
  iconCard: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: Platform.OS === 'ios' ? 0.18 : 0,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
  },
  iconImage: {
    width: 72,
    height: 72,
  },
});
