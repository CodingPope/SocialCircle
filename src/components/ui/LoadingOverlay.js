import React, { useEffect } from 'react';
import { View, StyleSheet, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

// Description: Non-blocking loading overlay - shows subtle indicator instead of covering full screen
// Use this only for critical initial auth/session checks, not background refreshes
export default function LoadingOverlay({ visible, blocking = true }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 300 });
      // Subtle breathing animation for logo
      scale.value = withRepeat(
        withSequence(
          withTiming(1.08, {
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      // Pulsing glow effect
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, {
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.15, {
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      );
    } else {
      opacity.value = withTiming(0, { duration: 250 });
      scale.value = withTiming(1, { duration: 200 });
      glowOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  if (!visible) return null;

  // Non-blocking mode: only show when user initiates action, not background refreshes
  if (!blocking) return null;

  return (
    <Animated.View
      style={[styles.overlay, fadeStyle]}
      pointerEvents='auto'
      accessibilityRole='alert'
      accessible
    >
      <LinearGradient
        colors={['#0A0C14', '#1a1d2e', '#0A0C14']}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
      />

      {/* Glow effect behind logo */}
      <Animated.View style={[styles.glowContainer, glowStyle]}>
        <View style={styles.glow} />
      </Animated.View>

      {/* Logo */}
      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.logo}
          resizeMode='contain'
          accessibilityLabel='Social Circle loading'
        />
      </Animated.View>
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
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  glowContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#6366f1',
    shadowColor: '#6366f1',
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 60,
    // No elevation: Android elevation on a colored circle creates an octagonal
    // shadow artifact due to the outline provider; the glow is purely opacity-driven.
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 140,
    height: 140,
  },
});
