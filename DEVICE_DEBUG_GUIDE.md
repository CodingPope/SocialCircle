# Debugging iOS Device Stuck on Splash Screen

## Issue Summary

The app works fine on iOS simulator but gets stuck on the splash screen when installed on a physical iOS device. This typically indicates a runtime error that's being silenced.

## Changes Made

### 1. Fixed Environment Variable Handling

**File**: `src/services/firebase/config.js`

Changed from direct import to safe require pattern:

```javascript
// Before (causes crash in production)
import { USE_FIREBASE_EMULATORS } from '@env';

// After (safe fallback)
let USE_FIREBASE_EMULATORS = '0';
try {
  const envVars = require('@env');
  if (envVars && envVars.USE_FIREBASE_EMULATORS) {
    USE_FIREBASE_EMULATORS = envVars.USE_FIREBASE_EMULATORS;
  }
} catch (error) {
  // @env module not available in production builds, use default
}
```

**Why**: The `react-native-dotenv` babel plugin doesn't bundle environment variables into production builds by default. When the app tries to import from `@env` on a physical device, it gets `undefined`, causing silent crashes.

### 2. Added Error Boundary

**File**: `src/components/ErrorBoundary.js` (new file)

Catches React errors and displays a user-friendly error screen with:

- Error message
- Reload button
- Detailed error info in development mode

**File**: `App.js`
Wrapped the root component with ErrorBoundary.

### 3. Enhanced Logging

Added console.log statements throughout the app initialization chain:

- `App.js` - Root component rendering
- `src/services/firebase/config.js` - Firebase initialization
- `src/features/profile/stores/userStore.js` - Auth state listener

These logs persist even in production builds and will help identify where the app is failing.

## How to View Device Logs

### Method 1: Xcode Console (Recommended)

1. Connect your iPhone via USB
2. Open Xcode
3. Go to **Window → Devices and Simulators**
4. Select your device
5. Click **Open Console** button
6. Run your app and watch the logs

### Method 2: Terminal Command

```bash
# View all logs from your device
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "SocialCircle"' --level debug

# Or if device is connected:
idevicesyslog | grep SocialCircle
```

### Method 3: Safari Web Inspector (for JS console)

1. On iPhone: Settings → Safari → Advanced → Enable "Web Inspector"
2. On Mac: Safari → Develop → [Your iPhone Name] → [App Name]

## Debugging Steps

### Step 1: Check Device Logs

Run the app on your device and check the logs using one of the methods above. Look for:

- `[App] Initializing Social Circle app`
- `[Firebase] Initializing Firebase configuration`
- `[AppContent] Component rendering`
- `[UserStore] Starting auth state listener`

If you don't see these logs, the app is crashing before reaching App.js.

### Step 2: Check for Missing Dependencies

The issue might be a native module not properly linked. Verify:

```bash
cd ios
pod install
cd ..
```

### Step 3: Check Firebase Initialization

The app uses `@react-native-firebase` native modules. Ensure GoogleService-Info.plist is properly included:

- Located at project root: ✅ (confirmed)
- Referenced in app.json: ✅ (confirmed)
- Bundle ID matches: `com.socialcirclellc.app` ✅

### Step 4: Check for Build Configuration Issues

Verify the build was created with the correct profile:

```bash
# Check EAS build logs
eas build:list

# If using local build
npm run ios:prep-archive
# Then archive in Xcode
```

### Step 5: Clear App Data and Reinstall

Sometimes persisted data causes issues:

```bash
# On device: Delete app completely
# Then reinstall from TestFlight/Xcode
```

## Common Causes

### 1. ✅ Environment Variables (FIXED)

- `.env` file not bundled in production builds
- Solution: Use safe require pattern with fallbacks

### 2. AsyncStorage/Persistence Issues

- Zustand persistence might be corrupted
- Solution: Clear app data or add migration logic

### 3. Native Module Linking

- Firebase modules not properly linked
- Solution: `cd ios && pod install && cd ..`

### 4. Code Signing / Provisioning

- App crashes on launch due to entitlements mismatch
- Check: App uses Sign In with Apple - ensure entitlements are correct

### 5. Missing Assets

- Splash screen or other required assets not bundled
- Solution: Check asset catalog in Xcode

## Next Steps

1. **View the logs** using Xcode console (Method 1 above)
2. **Look for error messages** - the enhanced logging will show where initialization fails
3. **Share the logs** - if you see errors, they'll help identify the exact issue

## Testing the Fix

### Build and Test

```bash
# Option 1: Local development build
npm run ios:device

# Option 2: EAS preview build
eas build --platform ios --profile preview

# Option 3: Archive in Xcode
npm run ios:prep-archive
# Then in Xcode: Product → Archive
```

### Expected Log Output (Success)

```
[App] Initializing Social Circle app
[Firebase] Initializing Firebase configuration
[Firebase] Environment variables loaded
[Firebase] Initializing auth singleton
[Firebase] Auth instance created successfully
[AppContent] Component rendering
[AppContent] State: { storeLoading: true, checking: true, appReady: false, hasUser: false }
[UserStore] Starting auth state listener
[UserStore] Auth state changed: { hasUser: false }
[UserStore] No user signed in
[AppContent] State: { storeLoading: false, checking: true, appReady: false, hasUser: false }
```

## If Issue Persists

If the app is still stuck after these changes:

1. **Check the Xcode console logs** - this is critical
2. Look for any native crash reports in Xcode Organizer
3. Try running on a different physical device
4. Create a fresh production build
5. Check if there are any pending App Store Connect configurations

## Files Modified

- ✅ `src/services/firebase/config.js` - Safe environment variable handling
- ✅ `src/components/ErrorBoundary.js` - New error boundary component
- ✅ `App.js` - Added ErrorBoundary wrapper and logging
- ✅ `src/features/profile/stores/userStore.js` - Enhanced auth listener logging

The changes are backward compatible and won't affect simulator functionality.
