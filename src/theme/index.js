import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useThemeStore } from '../store/themeStore';

// Description: Light mode color palette
const lightColors = {
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
  // Text colors for light mode
  text: '#111827',
  textSecondary: '#64748B',
  background: '#FFFFFF',
  backgroundSecondary: '#F8FAFC',
  border: '#E2E8F0',
  card: '#FFFFFF',
  divider: 'rgba(148, 163, 184, 0.35)',
  chipBackground: '#EEF2FF',
  chipBackgroundActive: '#2563EB',
  chipText: '#1F2937',
  chipTextActive: '#FFFFFF',
  fabBackground: '#2563EB',
  fabForeground: '#FFFFFF',
  tooltipBackground: '#101824',
  tooltipText: '#E5EDFF',
  inputBackground: '#F1F5F9',
  surfaceElevated: '#FFFFFF',
  surfaceOverlay: 'rgba(255,255,255,0.92)',
};

// Description: Dark mode color palette
const darkColors = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#60A5FA',
  secondary: '#A855F7',
  secondaryLight: '#C084FC',
  neutral100: '#0F172A',
  neutral200: '#1E293B',
  neutral300: '#334155',
  neutral400: '#475569',
  neutral500: '#64748B',
  neutral600: '#94A3B8',
  neutral700: '#CBD5E1',
  neutral800: '#E2E8F0',
  neutral900: '#F1F5F9',
  success: '#22C55E',
  warning: '#FBBF24',
  danger: '#EF4444',
  overlay: 'rgba(0, 0, 0, 0.7)',
  // Text colors for dark mode
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  background: '#0F172A',
  backgroundSecondary: '#1E293B',
  border: '#334155',
  card: '#1E293B',
  divider: 'rgba(148, 163, 184, 0.25)',
  chipBackground: 'rgba(148,163,184,0.16)',
  chipBackgroundActive: '#3B82F6',
  chipText: '#E2E8F0',
  chipTextActive: '#FFFFFF',
  fabBackground: '#3B82F6',
  fabForeground: '#0B1120',
  tooltipBackground: 'rgba(15,23,42,0.95)',
  tooltipText: '#E5EDFF',
  inputBackground: '#1F2937',
  surfaceElevated: '#1E293B',
  surfaceOverlay: 'rgba(15,23,42,0.92)',
};

const gradients = {
  hero: ['#2563EB', '#7C3AED'],
  heroSecondary: ['#3B82F6', '#A855F7'],
};

const darkGradients = {
  hero: ['#3B82F6', '#A855F7'],
  heroSecondary: ['#60A5FA', '#C084FC'],
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
  colors: lightColors,
  gradients,
  spacing,
  radii,
  mode: 'light',
  isDark: false,
};

const darkTheme = {
  colors: darkColors,
  gradients: darkGradients,
  spacing,
  radii,
  mode: 'dark',
  isDark: true,
};

const ThemeContext = createContext(lightTheme);

export const ThemeProvider = ({ children, value, mode = 'light' }) => {
  // Description: Get theme methods directly from store without subscribing to prevent re-render loops
  const themeMethods = useMemo(() => {
    const store = useThemeStore.getState();
    return {
      setMode: store.setMode,
      toggleMode: store.toggleMode,
    };
  }, []); // Empty deps - we only need these once, they don't change

  const themeValue = useMemo(() => {
    if (value) return value;
    const baseTheme = mode === 'dark' ? darkTheme : lightTheme;
    return {
      ...baseTheme,
      ...themeMethods,
    };
  }, [mode, value, themeMethods]);

  return (
    <ThemeContext.Provider value={themeValue}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export { lightTheme, darkTheme };
