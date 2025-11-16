# Dark Mode Quick Reference

## Components with keyboard Appearance Fixed ✅

### Core Input Screens
```javascript
// Pattern used in all updated files:
import { useThemeStore } from '../path/to/store/themeStore';

const Component = () => {
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  
  return (
    <TextInput
      // ... other props
      keyboardAppearance={themeMode === 'dark' ? 'dark' : 'light'}
    />
  );
};
```

### Updated Files (13 TextInputs total)
1. **CreateEventScreen** - Title, Description, Capacity inputs
2. **EventChatScreen** - Message input, Edit description, Pinned announcement
3. **ProfileScreen** - Bio input
4. **AuthScreen** - Email, Password inputs  
5. **VerificationModal** - Phone number, Verification code inputs
6. **CreateInterestPostModal** - Content input
7. **EditInterestPostModal** - Content input

## What's Working

### ✅ Keyboard
- Dark keyboard appears when dark mode is enabled
- Light keyboard appears when light mode is enabled
- Works on all major input screens

### ✅ Notifications
- NotificationScreen uses theme colors throughout
- All UI elements (cards, text, buttons, modals) respect dark mode
- No custom fixes needed - already properly implemented

### ✅ UI Components
- All screens use `theme.colors.*` for dynamic theming
- StatusBar adapts: `barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}`
- Proper contrast for text, backgrounds, and borders

## What Can't Be Changed

### ⚠️ Native Share Dialog
- `Share.share()` is controlled by iOS/Android OS
- Uses system-level dark mode setting
- Cannot be themed from within the app
- **Solution**: User must enable system dark mode for dark share sheets

## How to Toggle Dark Mode

1. Open ProfileScreen (bottom right tab)
2. Tap hamburger menu (top left)
3. Find "Dark Mode" toggle under Settings
4. Toggle on/off

Changes apply immediately across the entire app.

## Theme Architecture

```
src/
├── theme/
│   └── index.js         # Light/dark color palettes, ThemeProvider
├── store/
│   └── themeStore.js    # Zustand store for theme mode persistence
└── components/
    └── themed/
        └── ThemedComponents.js  # Pre-built themed components
```

### Using Theme in Components
```javascript
import { useTheme } from '../theme';
import { useThemeStore } from '../store/themeStore';

const MyComponent = () => {
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const toggleTheme = useThemeStore((state) => state.toggleMode);
  
  return (
    <View style={{ backgroundColor: theme.colors.background }}>
      <Text style={{ color: theme.colors.text }}>
        {themeMode === 'dark' ? 'Dark' : 'Light'} Mode Active
      </Text>
    </View>
  );
};
```

## Color Palette Access

All screens should use these instead of hardcoded colors:

```javascript
theme.colors.primary       // #3B82F6 (dark) / #2563EB (light)
theme.colors.background    // #0F172A (dark) / #FFFFFF (light)
theme.colors.card          // #1E293B (dark) / #FFFFFF (light)
theme.colors.text          // #F1F5F9 (dark) / #111827 (light)
theme.colors.textSecondary // #94A3B8 (dark) / #64748B (light)
theme.colors.border        // #334155 (dark) / #E2E8F0 (light)
// ... and 20+ more semantic colors
```

Full palette in `src/theme/index.js`.
