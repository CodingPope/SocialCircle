# Dark Mode Implementation Guide

This app now supports **complete dark mode** throughout! Users can toggle between light and dark themes from the Profile screen settings. Dark mode is applied to:

- ✅ All navigation (tab bars, headers)
- ✅ Map with custom dark styling
- ✅ All screens and backgrounds
- ✅ Text and UI elements
- ✅ Modals and overlays
- ✅ Cards and containers

## Quick Start with Themed Components

We've created helper components that make implementing dark mode trivial:

```javascript
import {
  ThemedScreen,
  ThemedView,
  ThemedText,
  ThemedCard,
} from '../../../components/themed/ThemedComponents';

export default function MyScreen() {
  return (
    <ThemedScreen scrollable>
      <ThemedView style={{ padding: 16 }}>
        <ThemedText variant='h1'>Hello World</ThemedText>
        <ThemedText variant='body'>This text automatically adapts!</ThemedText>

        <ThemedCard>
          <ThemedText variant='h3'>Card Title</ThemedText>
          <ThemedText variant='caption'>Card description</ThemedText>
        </ThemedCard>
      </ThemedView>
    </ThemedScreen>
  );
}
```

That's it! No manual theme handling needed.

## Available Themed Components

### ThemedScreen

Complete screen wrapper with SafeAreaView, StatusBar, and optional ScrollView.

```javascript
<ThemedScreen scrollable={true} contentContainerStyle={{ padding: 16 }}>
  {/* Your content */}
</ThemedScreen>
```

### ThemedView

Basic View with theme background.

```javascript
<ThemedView style={{ padding: 20 }}>{/* Content */}</ThemedView>
```

### ThemedCard

Card component with proper background, borders, and padding.

```javascript
<ThemedCard>
  <Text>Card content</Text>
</ThemedCard>
```

### ThemedText

Text with automatic color and variants.

```javascript
<ThemedText variant="h1">Title</ThemedText>
<ThemedText variant="h2">Subtitle</ThemedText>
<ThemedText variant="body">Body text</ThemedText>
<ThemedText variant="caption">Caption text</ThemedText>
<ThemedText variant="label">Label</ThemedText>
```

### ThemedScrollView & ThemedSafeAreaView

Drop-in replacements for ScrollView and SafeAreaView with theme colors.

---

## How to Use Dark Mode in Your Components

### 1. Import the useTheme hook

```javascript
import { useTheme } from '../../../theme';
```

### 2. Get the theme object in your component

```javascript
export default function MyComponent() {
  const theme = useTheme();

  // Use theme colors in your styles
  return (
    <View style={{ backgroundColor: theme.colors.background }}>
      <Text style={{ color: theme.colors.text }}>Hello World</Text>
    </View>
  );
}
```

### 3. Available Theme Colors

The theme object provides the following colors that automatically adapt to dark/light mode:

#### Core Colors

- `theme.colors.primary` - Primary brand color
- `theme.colors.primaryDark` - Darker primary variant
- `theme.colors.primaryLight` - Lighter primary variant
- `theme.colors.secondary` - Secondary brand color
- `theme.colors.secondaryLight` - Lighter secondary variant

#### Neutral/Grayscale

- `theme.colors.neutral100` through `theme.colors.neutral900`
- These automatically invert in dark mode

#### Semantic Colors

- `theme.colors.success` - Success/positive actions
- `theme.colors.warning` - Warning/caution
- `theme.colors.danger` - Error/destructive actions

#### UI-Specific Colors (Recommended)

- `theme.colors.text` - Primary text color
- `theme.colors.textSecondary` - Secondary/muted text
- `theme.colors.background` - Main background
- `theme.colors.backgroundSecondary` - Cards, panels, sections
- `theme.colors.border` - Border color
- `theme.colors.card` - Card backgrounds
- `theme.colors.overlay` - Modal overlays

#### Other Properties

- `theme.isDark` - Boolean indicating if dark mode is active
- `theme.gradients` - Pre-defined gradients
- `theme.spacing` - Consistent spacing values (xs, sm, md, lg, xl)
- `theme.radii` - Border radius values (sm, md, lg, xl, pill)

### 4. Using with StyleSheet

For static styles, you can use inline style overrides:

```javascript
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default function MyComponent() {
  const theme = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Text style={[styles.text, { color: theme.colors.text }]}>
        Themed Text
      </Text>
    </View>
  );
}
```

### 5. Complete Example

```javascript
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../../theme';

export default function ThemedCard({ title, description, onPress }) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
        {description}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
  },
});
```

### 6. StatusBar

Don't forget to update the StatusBar for each screen:

```javascript
import { StatusBar } from 'react-native';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';

export default function MyScreen() {
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      {/* Your content */}
    </View>
  );
}
```

## Theme Store

The theme preference is stored using Zustand with AsyncStorage persistence, so it persists across app restarts.

### Accessing Theme Mode

```javascript
import { useThemeStore } from '../../../store/themeStore';

const themeMode = useThemeStore((state) => state.mode); // 'light' or 'dark'
const toggleTheme = useThemeStore((state) => state.toggleMode);
const setTheme = useThemeStore((state) => state.setMode);
```

## Migration Tips

When updating existing components:

1. Replace hardcoded colors with theme colors
2. Use `theme.colors.text` instead of `#333`, `#000`, etc.
3. Use `theme.colors.background` instead of `#fff`, `#FFFFFF`
4. Use `theme.colors.card` for cards and panels
5. Use `theme.colors.border` for borders
6. Add StatusBar with theme-aware styling

## Testing

Test your components in both light and dark modes:

1. Open Profile screen
2. Tap the menu icon (top right)
3. Toggle "Dark Mode"
4. Navigate through your app to verify all screens look good
