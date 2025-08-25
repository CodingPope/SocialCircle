// Description: Full-screen loading overlay with animated logo glow
import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export default function LoadingOverlay({ visible }) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      t.value = withRepeat(withTiming(1, { duration: 1800 }), -1, true);
    } else {
      t.value = 0;
    }
  }, [visible]);

  const glow = useAnimatedStyle(() => {
    const scale = interpolate(t.value, [0, 1], [0.95, 1.06]);
    const opacity = interpolate(t.value, [0, 1], [0.7, 1]);
    return { transform: [{ scale }], opacity };
  });

  if (!visible) return null;
  return (
    <View style={styles.overlay} pointerEvents='auto'>
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.75)']}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.logoWrap, glow]}>
        <Image
          source={require('../../../assets/SocialCircleLogoClear.png')}
          style={styles.logo}
          resizeMode='contain'
          accessibilityLabel='Loading'
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  logoWrap: {
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: (width * 0.5) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff6b6b',
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  logo: {
    width: '85%',
    height: '85%',
  },
});
