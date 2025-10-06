// Description: Themed components that automatically adapt to dark/light mode
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../theme';
import { useThemeStore } from '../../store/themeStore';

/**
 * ThemedView - A View component that automatically uses theme background
 */
export const ThemedView = ({ style, children, ...props }) => {
  const theme = useTheme();
  return (
    <View
      style={[{ backgroundColor: theme.colors.background }, style]}
      {...props}
    >
      {children}
    </View>
  );
};

/**
 * ThemedCard - A card component with theme-aware background and border
 */
export const ThemedCard = ({ style, children, ...props }) => {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

/**
 * ThemedText - Text component that automatically uses theme text color
 */
export const ThemedText = ({ style, variant = 'body', children, ...props }) => {
  const theme = useTheme();

  const variantStyles = {
    h1: { fontSize: 32, fontWeight: 'bold', color: theme.colors.text },
    h2: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text },
    h3: { fontSize: 20, fontWeight: '600', color: theme.colors.text },
    body: { fontSize: 16, color: theme.colors.text },
    caption: { fontSize: 14, color: theme.colors.textSecondary },
    label: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.colors.textSecondary,
    },
  };

  return (
    <Text style={[variantStyles[variant], style]} {...props}>
      {children}
    </Text>
  );
};

/**
 * ThemedScrollView - ScrollView with theme-aware background
 */
export const ThemedScrollView = ({
  style,
  contentContainerStyle,
  children,
  ...props
}) => {
  const theme = useTheme();
  return (
    <ScrollView
      style={[{ backgroundColor: theme.colors.background }, style]}
      contentContainerStyle={contentContainerStyle}
      {...props}
    >
      {children}
    </ScrollView>
  );
};

/**
 * ThemedSafeAreaView - SafeAreaView with theme background and StatusBar
 */
export const ThemedSafeAreaView = ({ style, children, ...props }) => {
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);

  return (
    <SafeAreaView
      style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}
      {...props}
    >
      <StatusBar
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      {children}
    </SafeAreaView>
  );
};

/**
 * ThemedScreen - Complete screen wrapper with SafeAreaView, StatusBar, and ScrollView
 */
export const ThemedScreen = ({
  children,
  scrollable = true,
  style,
  contentContainerStyle,
  ...props
}) => {
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);

  const Container = scrollable ? ThemedScrollView : ThemedView;

  return (
    <SafeAreaView
      style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}
      {...props}
    >
      <StatusBar
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <Container
        style={{ flex: 1 }}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </Container>
    </SafeAreaView>
  );
};

/**
 * useThemedStyles - Hook to create theme-aware styles
 * Usage:
 * const styles = useThemedStyles((theme) => ({
 *   container: { backgroundColor: theme.colors.card },
 *   text: { color: theme.colors.text }
 * }));
 */
export const useThemedStyles = (createStyles) => {
  const theme = useTheme();
  return React.useMemo(() => createStyles(theme), [theme]);
};
