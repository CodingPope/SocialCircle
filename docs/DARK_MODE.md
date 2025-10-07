# 🌙 Dark Mode - Complete Guide

> **Status:** ✅ Production Ready — Core user flows 100% themed

---

## 📱 User Experience

Users can toggle dark mode from:  
**Profile → Menu (☰) → Dark Mode Switch**

The preference:
- ✅ Saves locally (AsyncStorage)
- ✅ Persists across app restarts
- ✅ Applies instantly app-wide
- ✅ Includes custom dark map styling

---

## 🎨 Color System

### Light Mode
- **Background:** `#FFFFFF`
- **Card:** `#FFFFFF`
- **Text:** `#111827`
- **Text Secondary:** `#6B7280`
- **Border:** `#E2E8F0`

### Dark Mode
- **Background:** `#0F172A` (dark slate)
- **Card:** `#1E293B` (darker slate)
- **Text:** `#F1F5F9` (light)
- **Text Secondary:** `#94A3B8`
- **Border:** `#334155` (muted)

### Semantic Colors (Consistent in both modes)
- **Primary:** `#3B82F6` (blue)
- **Success:** `#10B981` (green)
- **Warning:** `#F59E0B` (amber)
- **Danger:** `#EF4444` (red)

---

## 🚀 Quick Start - Using Themed Components

The **easiest way** to implement dark mode is using our pre-built themed components:

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
        <ThemedText variant="h1">Hello World</ThemedText>
        <ThemedText variant="body">This text automatically adapts!</ThemedText>

        <ThemedCard>
          <ThemedText variant="h3">Card Title</ThemedText>
          <ThemedText variant="caption">Card description</ThemedText>
        </ThemedCard>
      </ThemedView>
    </ThemedScreen>
  );
}
```

That's it! No manual theme handling needed. ✨

---

## 📦 Available Themed Components

### `<ThemedScreen>`
Complete screen wrapper with SafeAreaView, StatusBar, and optional ScrollView.

**Props:**
- `scrollable` (boolean) - Wraps content in ScrollView
- `contentContainerStyle` (object) - Style for scroll content
- `style` (object) - Additional styles

```javascript
<ThemedScreen scrollable contentContainerStyle={{ padding: 16 }}>
  {/* Your content */}
</ThemedScreen>
```

### `<ThemedView>`
Basic View with theme background.

```javascript
<ThemedView style={{ padding: 20 }}>
  {/* Content */}
</ThemedView>
```

### `<ThemedCard>`
Card component with proper background, borders, and padding.

```javascript
<ThemedCard>
  <Text>Card content</Text>
</ThemedCard>
```

### `<ThemedText>`
Text with automatic color and typography variants.

**Variants:**
- `h1` - Large heading
- `h2` - Medium heading
- `h3` - Small heading
- `body` - Body text (default)
- `caption` - Small caption text
- `label` - Label text

```javascript
<ThemedText variant="h1">Title</ThemedText>
<ThemedText variant="body">Body text</ThemedText>
<ThemedText variant="caption">Small text</ThemedText>
```

### `<ThemedScrollView>` & `<ThemedSafeAreaView>`
Drop-in replacements with theme colors applied.

---

## 🛠 Manual Theme Implementation

For custom components or fine-grained control:

### 1. Import Theme Hooks

```javascript
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
```

### 2. Use in Component

```javascript
export default function MyComponent() {
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);

  return (
    <View style={{ backgroundColor: theme.colors.background }}>
      <StatusBar 
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <Text style={{ color: theme.colors.text }}>Hello World</Text>
    </View>
  );
}
```

### 3. Available Theme Properties

#### `theme.colors.*`
- **UI Colors:** `background`, `backgroundSecondary`, `card`, `border`, `overlay`
- **Text:** `text`, `textSecondary`
- **Brand:** `primary`, `primaryDark`, `primaryLight`, `secondary`, `secondaryLight`
- **Semantic:** `success`, `warning`, `danger`
- **Neutrals:** `neutral100` through `neutral900` (auto-invert in dark mode)

#### Other Properties
- `theme.isDark` - Boolean (true if dark mode active)
- `theme.spacing` - `{ xs, sm, md, lg, xl }` spacing values
- `theme.radii` - `{ sm, md, lg, xl, pill }` border radius values
- `theme.gradients` - Pre-defined gradient arrays

---

## 📐 Using with StyleSheet

For components with `StyleSheet.create`, use the `createStyles` pattern:

```javascript
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../theme';

const createStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
});

export default function MyComponent() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Title</Text>
        <Text style={styles.subtitle}>Subtitle</Text>
      </View>
    </View>
  );
}
```

**Why `useMemo`?**  
Prevents recreating the styles object on every render, improving performance.

---

## 🗺️ Map Dark Mode

The map automatically switches to night mode when dark theme is active.

**Custom dark map style includes:**
- Dark background: `#1e293b`
- Dark roads: `#334155`
- Dark water: `#0f172a`
- Dark parks: `#1e3a28` (dark green)
- Muted labels: `#94a3b8`

**Implementation:**
```javascript
import { darkMapStyle } from '../config/mapStyles';

<MapView
  customMapStyle={themeMode === 'dark' ? darkMapStyle : null}
  // ...other props
/>
```

Defined in: `src/config/mapStyles.js`

---

## ✅ Fully Themed Components

These components have complete dark mode support:

### Core Screens
- ✅ **MapScreen** - Map + night mode styling
- ✅ **DiscoveryScreen** - Feed and filters
- ✅ **ProfileScreen** - Profile + dark mode toggle
- ✅ **OtherUserProfileScreen** - User profiles
- ✅ **EventChatScreen** - Chat interface
- ✅ **MyCircle** - Activity feed

### UI Components
- ✅ **PostCard** - Event cards
- ✅ **EventPopUpCard** - Event bottom sheet
- ✅ **UpcomingEventCard** - Event carousel
- ✅ **ThemedComponents** - All themed wrappers
- ✅ **AppNavigator** - Tab bars

### Navigation
- ✅ Tab bars (Main + Business)
- ✅ Headers
- ✅ StatusBar handling

---

## 📝 Migration Checklist

Use this when adding dark mode to a new screen:

### Step 1: Import Theme
```javascript
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
```

### Step 2: Add Hooks
```javascript
const theme = useTheme();
const themeMode = useThemeStore((state) => state.mode);
const styles = useMemo(() => createStyles(theme), [theme]);
```

### Step 3: Add StatusBar
```javascript
<StatusBar
  barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
  backgroundColor={theme.colors.background}
/>
```

### Step 4: Convert Styles
Create a `createStyles(theme)` function and replace:

| Old (Hardcoded) | New (Theme-Aware) |
|-----------------|-------------------|
| `#FFFFFF` | `theme.colors.background` or `theme.colors.card` |
| `#000000` | `theme.colors.text` |
| `#F8F9FA` | `theme.colors.backgroundSecondary` |
| `#333`, `#111` | `theme.colors.text` |
| `#666`, `#777` | `theme.colors.textSecondary` |
| `#E0E0E0`, `#CCC` | `theme.colors.border` |

### Step 5: Test Both Modes
- [ ] Open screen in light mode - looks good?
- [ ] Toggle to dark mode - looks good?
- [ ] No harsh white flashes?
- [ ] Text is readable?
- [ ] Icons are visible?
- [ ] Borders visible but subtle?

---

## 🧪 Testing Dark Mode

### Manual Testing
1. Open app in light mode
2. Go to **Profile → Menu → Dark Mode**
3. Toggle the switch
4. Navigate through:
   - Map screen
   - Discovery feed
   - Event details
   - Chat screens
   - Profile

### Edge Cases to Check
- [ ] Loading states
- [ ] Empty states
- [ ] Error messages
- [ ] Modals/popups
- [ ] List items
- [ ] Shadows (opacity may need adjustment)
- [ ] StatusBar color on each screen

---

## 📂 File Structure

```
src/
├── theme/
│   └── index.js                         # Light + dark theme definitions
├── store/
│   └── themeStore.js                    # Theme state management (Zustand)
├── config/
│   └── mapStyles.js                     # Dark map configuration
├── components/
│   └── themed/
│       └── ThemedComponents.js          # Reusable themed components
├── navigation/
│   └── AppNavigator.js                  # Tab bar theming
└── features/
    └── events/
        └── components/
            ├── MapScreen.js             # Map dark mode
            ├── DiscoveryScreen.js       # Discovery theming
            ├── ProfileScreen.js         # Dark mode toggle
            ├── EventChatScreen.js       # Chat theming
            └── PostCard.js              # Event card theming
```

---

## 🎯 Current Status

### ✅ Complete (100%)
- Core user flows
- Main screens (Map, Discovery, Profile, Chat)
- Navigation & tab bars
- Event cards and details
- Map night mode

### ⚠️ Remaining (Optional)
- NotificationScreen
- BlipPreview (map marker preview)
- MapFilterBar
- AnalyticsConsentPrompt
- Generic UI components (Card, Modal, InputField)

**The app is production-ready for dark mode!** 🚀

---

## 💡 Best Practices

1. **Always use theme colors** - Never hardcode `#fff` or `#000`
2. **Use semantic names** - `theme.colors.text` not `neutral900`
3. **Test both modes** - Toggle and verify appearance
4. **Use ThemedComponents when possible** - Less code, automatic theming
5. **Don't forget StatusBar** - Theme it on every screen
6. **Use `createStyles` pattern** - Keep StyleSheet but make it theme-aware
7. **Wrap in `useMemo`** - Prevent unnecessary style recalculations
8. **Check shadows** - May need reduced opacity in dark mode

---

## 🔧 Troubleshooting

### Theme not updating?
- Check that component uses `useTheme()` hook
- Verify styles are recreated when theme changes (use `useMemo`)
- Ensure `ThemeProvider` wraps your app in `App.js`

### StatusBar wrong color?
- Add StatusBar component to screen
- Use `themeMode === 'dark' ? 'light-content' : 'dark-content'`

### White flash on screen transition?
- Set `backgroundColor: theme.colors.background` on container
- Add StatusBar to the new screen

### Map not switching to dark mode?
- Check `customMapStyle` prop on MapView
- Verify `themeMode === 'dark'` condition
- Import `darkMapStyle` from `src/config/mapStyles.js`

---

## 📚 Additional Resources

- **Theme Config:** `src/theme/index.js`
- **Theme Store:** `src/store/themeStore.js`
- **Themed Components:** `src/components/themed/ThemedComponents.js`
- **Map Styles:** `src/config/mapStyles.js`

---

**Last Updated:** October 6, 2025  
**Version:** 1.0 - Production Ready
