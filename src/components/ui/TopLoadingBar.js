import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

// Description: Subtle top loading bar for background refreshes (doesn't block content)
export default function TopLoadingBar({ visible, color = '#4da6ff' }) {
  const translateX = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      translateX.value = withRepeat(
        withSequence(
          withTiming(100, {
            duration: 1200,
            easing: Easing.bezier(0.65, 0, 0.35, 1),
          }),
          withTiming(-100, { duration: 0 })
        ),
        -1,
        false
      );
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      translateX.value = -100;
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: `${translateX.value}%` }],
  }));

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents='none'>
      <Animated.View
        style={[styles.bar, { backgroundColor: color }, animatedStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    overflow: 'hidden',
    zIndex: 9999,
  },
  bar: {
    width: '40%',
    height: '100%',
    borderRadius: 2,
  },
});
