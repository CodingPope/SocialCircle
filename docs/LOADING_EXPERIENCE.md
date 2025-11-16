# 🎨 Loading Experience Design

## Overview
The Social Circle app now features a clean, professional loading experience with smooth transitions and consistent branding.

## Loading Flow

### 1. **Native Splash Screen** (Initial Launch)
- **Background**: Dark (`#0A0C14`)
- **Logo**: App icon centered at natural size
- **Duration**: Shows until app initializes
- **Config**: `app.json` → `splash` section

### 2. **Loading Overlay** (Transitions)
- **Background**: Solid dark (`#0A0C14`)
- **Logo**: 120x120px app icon
- **Animation**: Subtle breathing effect (1.0 → 1.05 scale)
- **Duration**: While checking auth/profile state
- **When shown**:
  - Initial app load
  - Transitioning from login → map
  - Any profile/auth state checks

### 3. **App Content** (Ready)
- Smooth fade-in once navigation is ready
- Splash screen hidden automatically
- No jarring transitions

## Key Improvements

✅ **Removed huge adaptive icon** - Now uses clean app logo
✅ **Consistent dark background** - Matches app theme
✅ **Smooth animations** - Subtle pulse instead of static
✅ **Proper splash handling** - Native splash + overlay coordination
✅ **Fast transitions** - 200ms fade animations

## Technical Implementation

### Splash Screen (`app.json`)
```json
"splash": {
  "image": "./assets/icon.png",
  "resizeMode": "contain",
  "backgroundColor": "#0A0C14"
}
```

### Loading Overlay (`LoadingOverlay.js`)
- Uses `react-native-reanimated` for smooth animations
- Breathing animation: 1200ms cycle
- Opacity transitions: 200ms
- Full-screen dark backdrop

### App.js Integration
- `expo-splash-screen` prevents auto-hide
- Splash hidden when navigation is ready
- 100ms delay for smooth handoff

## Design Philosophy

**Clean** - No unnecessary visual clutter
**Fast** - Quick transitions, minimal delays
**Branded** - Consistent with Social Circle identity
**Professional** - Subtle animations, not distracting

## Assets Used
- `/assets/icon.png` - Main app logo (used everywhere)
- Background: `#0A0C14` (Social Circle dark)

---

*Last updated: November 2025*
