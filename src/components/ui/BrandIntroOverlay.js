import React, { useEffect } from 'react';
import { StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const BrandIntroOverlay = ({ visible, onHidden }) => {
  const opacity = useSharedValue(visible ? 1 : 0);
  const scale = useSharedValue(0.94);
  const orbit = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
    orbit.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  useEffect(() => {
    opacity.value = withTiming(
      visible ? 1 : 0,
      {
        duration: visible ? 0 : 450,
        easing: Easing.inOut(Easing.quad),
      },
      (finished) => {
        if (finished && !visible && onHidden) {
          runOnJS(onHidden)();
        }
      }
    );
  }, [visible, onHidden]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const orbStyle = useAnimatedStyle(() => {
    const angle = 2 * Math.PI * orbit.value;
    const radius = 130;
    return {
      transform: [
        { translateX: Math.cos(angle) * radius },
        { translateY: Math.sin(angle) * radius },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessible
      accessibilityRole='image'
      accessibilityLabel='Launching Social Circle'
    >
      <LinearGradient
        colors={['#fde3ea', '#f3c1ff', '#8ea0ff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.logoCard, logoStyle]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.35)']}
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={require('../../../assets/SocialCircleLogoClear.png')}
          style={styles.logo}
          resizeMode='contain'
        />
        <Animated.View style={[styles.orb, orbStyle]} />
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  logoCard: {
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#b689ff',
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 20,
  },
  logo: {
    width: 180,
    height: 160,
  },
  orb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,130,96,0.9)',
    shadowColor: '#fffb',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});

export default BrandIntroOverlay;
