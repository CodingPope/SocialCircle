// Description: Gradient background that pulls hero colors from the theme
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';

const gradientPresets = {
  onboarding: ['#ff6b6b', '#4dabf7'],
  profile: ['#ff6b6b', '#4dabf7'],
};

const AnimatedGradientBackground = ({ children, style, variant = 'hero' }) => {
  const theme = useTheme();
  const gradient =
    gradientPresets[variant] ||
    theme?.gradients?.[variant] ||
    theme.gradients.hero;

  return (
    <View style={[styles.container, style]}>
      <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default AnimatedGradientBackground;
