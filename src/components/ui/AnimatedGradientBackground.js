// Description: Animated gradient background for Social Circle screens
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedGradientBackground = ({ children, style }) => {
  // Shared value for animation progress
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 6000 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const color1 = interpolateColor(
      progress.value,
      [0, 1],
      ['#ff6b6b', '#4dabf7']
    );
    const color2 = interpolateColor(
      progress.value,
      [0, 1],
      ['#f7d794', '#a29bfe']
    );
    return {
      color1,
      color2,
    };
  });

  return (
    <Animated.View style={[styles.container, style]}>
      <LinearGradient
        colors={[
          animatedStyle.color1?.backgroundColor || '#ff6b6b',
          animatedStyle.color2?.backgroundColor || '#4dabf7',
        ]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default AnimatedGradientBackground;
