# App Tracking Transparency (ATT) Implementation

## Overview

This document describes the implementation of Apple's App Tracking Transparency (ATT) framework to comply with Guideline 5.1.2.

## Guideline Violation

**Apple Guideline 5.1.2**: Apps that collect user or usage data must use the AppTrackingTransparency framework to request permission. Custom tracking consent prompts are not allowed.

**Previous Issue**: The app used a custom `AnalyticsConsentPrompt` modal, which violates Apple's requirement to use the native ATT framework.

## Solution Implemented

### 1. Native ATT Integration

- **Package**: `expo-tracking-transparency`
- **Hook**: `src/hooks/useTrackingPermission.js`
- **Purpose**: Manages ATT permission state and requests

### 2. Files Modified

#### `src/hooks/useTrackingPermission.js` (NEW)

Custom React hook that:

- Lazy loads `expo-tracking-transparency` module
- Checks current tracking permission status
- Requests tracking permission using native iOS prompt
- Returns: `{ status, canPrompt, requestPermission, loading }`

Key features:

- Only works on iOS (returns 'unavailable' on Android)
- Handles missing module gracefully (Expo Go, web, etc.)
- Native prompt can only be shown once per app install
- Provides clear permission states: `'undetermined'`, `'granted'`, `'denied'`, `'restricted'`, `'unavailable'`

#### `App.js`

**Removed**:

- Custom `AnalyticsConsentPrompt` component
- `showAnalyticsPrompt` and `consentBusy` state
- Custom modal UI

**Added**:

- `useTrackingPermission()` hook
- Native ATT request logic in `useEffect`
- Automatic permission request when user hasn't decided yet

**Flow**:

1. Check if user has made analytics decision (`analyticsOptIn`)
2. Check if user was already prompted (`analyticsPromptedAt`)
3. Check if ATT can be shown (`canPrompt` === true when status is `'undetermined'`)
4. If conditions met, request ATT permission (shows native iOS prompt)
5. Save user's choice to Firestore (`persistAnalyticsChoice`)
6. Analytics service respects the `analyticsOptIn` flag

#### `app.json`

**Added**:

- Plugin: `"expo-tracking-transparency"`
- Info.plist key: `"NSUserTrackingUsageDescription"` with user-friendly message
  - Message: "We use analytics to improve app performance and personalize your experience. Your data is never sold."

### 3. Permission Flow

```
App Launch
    ↓
User Logged In
    ↓
Check: analyticsOptIn exists?
    ↓ No
Check: analyticsPromptedAt exists?
    ↓ No
Check: ATT status === 'undetermined'?
    ↓ Yes
Show Native ATT Prompt (iOS system dialog)
    ↓
User Responds (Allow/Deny)
    ↓
Save to Firestore:
  - analyticsOptIn: true/false
  - analyticsPromptedAt: timestamp
  - analyticsUpdatedAt: timestamp
  - analyticsConsentVersion: 1
    ↓
Update User Store
    ↓
Initialize Analytics with user's choice
    ↓
Track analytics_consent event
```

### 4. Edge Cases Handled

1. **ATT Already Granted** (via Settings before app asked):

   - Auto-persist `analyticsOptIn: true`

2. **ATT Already Denied/Restricted**:

   - Auto-persist `analyticsOptIn: false`

3. **Android / Non-iOS Platforms**:

   - ATT hook returns `'unavailable'`
   - No native prompt shown
   - Falls back to existing behavior

4. **Expo Go / Missing Module**:

   - Hook detects missing module
   - Returns `'unavailable'` status
   - No crashes or errors

5. **Business Account Sessions**:
   - Skip ATT prompt entirely
   - Business accounts don't need user consent

### 5. Testing Checklist

#### Before Submission:

- [ ] Install `expo-tracking-transparency` (✅ Done)
- [ ] Add plugin to `app.json` (✅ Done)
- [ ] Add `NSUserTrackingUsageDescription` to Info.plist (✅ Done via app.json)
- [ ] Remove custom `AnalyticsConsentPrompt` (✅ Done)
- [ ] Test native ATT prompt appears on fresh install
- [ ] Test "Allow" choice enables analytics
- [ ] Test "Deny" choice disables analytics
- [ ] Test user can only see prompt once
- [ ] Test analytics respects stored choice on subsequent launches
- [ ] Verify analytics events fire when opted in
- [ ] Verify analytics events DON'T fire when opted out
- [ ] Test on iOS 14.5+ (ATT requirement)
- [ ] Test on iOS < 14.5 (should gracefully handle)

#### Device Testing:

1. **Fresh Install Test**:

   - Delete app from device
   - Rebuild and install
   - Log in with new account
   - Verify native ATT prompt appears
   - Select "Allow Tracking"
   - Check Firestore: `analyticsOptIn: true`
   - Check analytics events are logged

2. **Deny Test**:

   - Fresh install again
   - Log in
   - Select "Ask App Not to Track"
   - Check Firestore: `analyticsOptIn: false`
   - Verify analytics events are NOT logged

3. **Settings Test**:
   - Go to Settings → Privacy → Tracking
   - Verify "Social Circle" appears in list
   - Change permission
   - App should respect the change

## Compliance Status

### ✅ FIXED: Guideline 5.1.2

- Removed custom tracking consent UI
- Implemented native ATT framework
- Added required Info.plist key
- Permission stored in Firestore
- Analytics service respects user choice

### Remaining Issues:

1. **Guideline 1.2** (User-Generated Content): Need TOS acceptance flow
2. **Guideline 5.1.5** (Location Services): Need fallback when location denied

## Build Instructions

After these changes, you MUST rebuild the native app:

```bash
# iOS
npx expo prebuild --clean
npx expo run:ios

# Or with EAS Build
eas build --platform ios --profile development
```

**Note**: The native ATT prompt will NOT appear in Expo Go. You must test on a development build or production build.

## References

- [Apple ATT Documentation](https://developer.apple.com/documentation/apptrackingtransparency)
- [Expo Tracking Transparency](https://docs.expo.dev/versions/latest/sdk/tracking-transparency/)
- [App Store Review Guidelines 5.1.2](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage)

## Questions & Troubleshooting

### Q: Why isn't the ATT prompt showing?

A:

- Check you're on iOS 14.5+
- Verify you're using a development/production build (not Expo Go)
- Check the user hasn't been prompted before (`analyticsPromptedAt`)
- Check ATT status isn't already `'granted'` or `'denied'`

### Q: Can users change their mind later?

A: Yes, via Settings → Privacy & Security → Tracking → Social Circle. The app will respect the system-level permission.

### Q: What happens on Android?

A: The ATT hook returns `'unavailable'` and no prompt is shown. Analytics work as before.

### Q: Does this affect Firebase Analytics?

A: Yes. When user denies tracking, `analyticsOptIn` is set to `false`, and `analyticsService.js` disables all tracking.

---

**Implementation Date**: 2025-01-XX  
**App Version**: 1.0.6+  
**Status**: ✅ Ready for Testing
