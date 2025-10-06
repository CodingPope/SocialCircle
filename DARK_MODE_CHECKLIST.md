# 🔄 Dark Mode Migration Checklist

Use this checklist when adding dark mode support to existing screens.

## Screen: `_______________`

### 1. Import Theme Hooks ✓ / ✗

```javascript
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';
```

### 2. Add Theme Hooks to Component ✓ / ✗

```javascript
const theme = useTheme();
const themeMode = useThemeStore((state) => state.mode);
```

### 3. Update Container/SafeAreaView ✓ / ✗

```javascript
// Before:
<SafeAreaView style={styles.container}>

// After:
<SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
```

### 4. Add StatusBar ✓ / ✗

```javascript
<StatusBar
  barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
  backgroundColor={theme.colors.background}
/>
```

### 5. Update Background Colors ✓ / ✗

Replace all hardcoded background colors:

- `#FFFFFF` → `theme.colors.background` or `theme.colors.card`
- `#F8F9FA` → `theme.colors.backgroundSecondary`
- `#000000` → Should use `theme.colors.background` in dark mode

### 6. Update Text Colors ✓ / ✗

Replace all hardcoded text colors:

- `#000`, `#111`, `#333` → `theme.colors.text`
- `#666`, `#777`, `#888` → `theme.colors.textSecondary`
- White text on dark bg → Needs conditional logic or use themed components

### 7. Update Border Colors ✓ / ✗

Replace all borders:

- `#E0E0E0`, `#CCC`, `#DDD` → `theme.colors.border`

### 8. Update Card/Panel Backgrounds ✓ / ✗

```javascript
// Before:
style={{ backgroundColor: '#FFF' }}

// After:
style={{ backgroundColor: theme.colors.card }}
```

### 9. Update Modals & Overlays ✓ / ✗

```javascript
// Modal background:
backgroundColor: theme.colors.card;

// Overlay:
backgroundColor: theme.colors.overlay;
```

### 10. Update Input Fields ✓ / ✗

```javascript
<TextInput
  style={{
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
    borderColor: theme.colors.border,
  }}
  placeholderTextColor={theme.colors.textSecondary}
/>
```

### 11. Update Buttons (if not using theme colors) ✓ / ✗

Primary buttons can stay with `theme.colors.primary` background.
Text buttons need color updates:

```javascript
<Text style={{ color: theme.colors.primary }}>Button</Text>
```

### 12. Update Icons ✓ / ✗

```javascript
// Before:
<Icon name="..." size={24} color="#333" />

// After:
<Icon name="..." size={24} color={theme.colors.text} />
```

### 13. Test Dark Mode ✓ / ✗

- [ ] Open screen in light mode - looks good?
- [ ] Toggle to dark mode - looks good?
- [ ] No harsh white flashes?
- [ ] Text is readable?
- [ ] Icons are visible?
- [ ] Borders are visible but subtle?

### 14. Test Edge Cases ✓ / ✗

- [ ] Loading states
- [ ] Empty states
- [ ] Error states
- [ ] Modal/popups
- [ ] List items
- [ ] Shadows (may need adjustment)

## Quick Replacement Guide

| Old (Light Only)  | New (Theme-Aware)                  |
| ----------------- | ---------------------------------- |
| `#FFFFFF`         | `theme.colors.background`          |
| `#000000`         | `theme.colors.text`                |
| `#F8F9FA`         | `theme.colors.backgroundSecondary` |
| `#333`, `#111`    | `theme.colors.text`                |
| `#666`, `#777`    | `theme.colors.textSecondary`       |
| `#E0E0E0`, `#CCC` | `theme.colors.border`              |
| `#2563EB` (blue)  | `theme.colors.primary`             |
| `#DC2626` (red)   | `theme.colors.danger`              |
| `#16A34A` (green) | `theme.colors.success`             |

## Alternative: Use Themed Components

Instead of manual theming, consider using ThemedComponents:

```javascript
import { ThemedScreen, ThemedText, ThemedCard } from '../../components/themed';

export default function MyScreen() {
  return (
    <ThemedScreen>
      <ThemedText variant='h1'>Title</ThemedText>
      <ThemedCard>
        <ThemedText>Content</ThemedText>
      </ThemedCard>
    </ThemedScreen>
  );
}
```

This eliminates steps 1-11 above! ✨

## Notes

- Some screens may need custom logic (e.g., gradients, images)
- Maps need custom dark styles (see mapStyles.js)
- Consider using `theme.isDark` for conditional rendering
- Shadows may need reduced opacity in dark mode

---

**Date Completed:** ******\_\_\_******  
**Tested By:** ******\_\_\_******  
**Issues Found:** ******\_\_\_******
