// Description: Gradient background that pulls hero colors from the theme
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';

const AnimatedGradientBackground = ({ children, style, variant = 'hero' }) => {
  const theme = useTheme();

  // Description: Use theme gradients for all variants, fallback to hero gradient
  const gradient = theme?.gradients?.[variant] || theme.gradients.hero;

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
