import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';

export default function Card({ children, style }) {
  const theme = useTheme();

  return <View style={[styles(theme).card, style]}>{children}</View>;
}

const styles = (theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 12,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.4 : 0.1,
      shadowRadius: 6,
      elevation: 3,
    },
  });
