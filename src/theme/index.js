import React, { createContext, useContext, useMemo } from 'react';

const baseColors = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryLight: '#3B82F6',
  secondary: '#7C3AED',
  secondaryLight: '#A855F7',
  neutral100: '#FFFFFF',
  neutral200: '#F8FAFC',
  neutral300: '#EEF2F7',
  neutral400: '#E2E8F0',
  neutral500: '#CBD5E1',
  neutral600: '#94A3B8',
  neutral700: '#64748B',
  neutral800: '#475569',
  neutral900: '#111827',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  overlay: 'rgba(15, 23, 42, 0.6)',
};

const gradients = {
  hero: ['#2563EB', '#7C3AED'],
  heroSecondary: ['#3B82F6', '#A855F7'],
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

const lightTheme = {
  colors: baseColors,
  gradients,
  spacing,
  radii,
};

const ThemeContext = createContext(lightTheme);

export const ThemeProvider = ({ children, value, mode = 'light' }) => {
  const themeValue = useMemo(() => {
    if (value) return value;
    switch (mode) {
      case 'light':
      default:
        return lightTheme;
    }
  }, [mode, value]);

  return <ThemeContext.Provider value={themeValue}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

export { lightTheme };
