import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

/**
 * InitialSplash renders a premium-looking splash overlay that stays visible
 * while the JS bundle, fonts or stores are still initializing. We keep it
 * lightweight but expressive so it can overlap with the Expo native splash.
 */
const InitialSplash = ({ visible }) => {
  const [shouldRender, setShouldRender] = useState(visible);
  const opacity = useSharedValue(visible ? 1 : 0);
  const logoScale = useSharedValue(0.94);
  const haloOpacity = useSharedValue(0.25);
  const haloScale = useSharedValue(1);
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      logoScale.value = withTiming(0.96, {
        duration: 220,
        easing: Easing.out(Easing.quad),
      });
      haloOpacity.value = withTiming(0, { duration: 220 });
      haloScale.value = withTiming(1.1, { duration: 220 });
      shimmerProgress.value = withTiming(0, { duration: 200 });
      opacity.value = withTiming(
        0,
        { duration: 220, easing: Easing.inOut(Easing.quad) },
        (finished) => {
          if (finished) {
            runOnJS(setShouldRender)(false);
          }
        }
      );
      return;
    }

    setShouldRender(true);
    opacity.value = withTiming(1, {
      duration: 180,
      easing: Easing.inOut(Easing.quad),
    });
    logoScale.value = withRepeat(
      withSequence(
        withTiming(1.05, {
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.97, {
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      true
    );
    haloOpacity.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 1600 }),
        withTiming(0.15, { duration: 1600 })
      ),
      -1,
      true
    );
    haloScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1600 }),
        withTiming(1, { duration: 1600 })
      ),
      -1,
      true
    );
    shimmerProgress.value = withRepeat(
      withTiming(1, { duration: 4600, easing: Easing.linear }),
      -1,
      false
    );
  }, [visible, opacity, haloOpacity, haloScale, logoScale, shimmerProgress]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value,
    transform: [{ scale: haloScale.value }],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: (shimmerProgress.value - 0.5) * 280,
      },
    ],
  }));

  if (!shouldRender) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      pointerEvents='none'
      accessibilityRole='image'
      accessibilityLabel='Preparing Social Circle'
    >
      <LinearGradient
        colors={['#05040A', '#11152B', '#05040A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.halo, haloStyle]} />
      <Animated.View style={[styles.logoCard, logoStyle]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.65)', 'rgba(255,255,255,0.15)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={require('../../../assets/SocialCircleLogoClear.png')}
          style={styles.logo}
          resizeMode='contain'
        />
        <Animated.View style={[styles.shimmer, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.65)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  halo: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOpacity: 0.6,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
    opacity: 0.3,
  },
  logoCard: {
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
    backgroundColor: 'rgba(5, 4, 10, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 20 },
    elevation: 20,
  },
  logo: {
    width: 170,
    height: 160,
  },
  shimmer: {
    position: 'absolute',
    width: 90,
    height: 260,
    top: -20,
    transform: [{ rotate: '20deg' }],
    opacity: 0.5,
  },
  shimmerGradient: {
    flex: 1,
  },
});

export default InitialSplash;
