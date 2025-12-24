# Firebase App Check Setup Guide

## 🚨 CRITICAL SECURITY ALERT

**App Check is NOT ENFORCED in production.** Your Firebase backend is currently vulnerable to:

- Unauthorized API access via HTTP requests
- Bot spam and abuse
- Quota theft and unexpected costs

**Action Required:** Follow the [Production Setup](#-production-setup) section to enable enforcement before public launch.

**Timeline:** 2-4 weeks for safe gradual rollout  
**Blocker Level:** P0 (must fix before marketing/App Store feature)

---

## 🔐 Overview

App Check protects your Firebase resources (Firestore, Functions, Storage) from abuse by verifying that requests come from your authentic app. This prevents unauthorized API access and quota theft.

**Current Status:**

- ✅ SDK installed and initialized (v21.6.0)
- ✅ Development mode configured (debug tokens)
- ✅ Production mode configured (DeviceCheck + Play Integrity)
- ❌ **NOT enforced in Firebase Console** (allows bypass)
- ❌ **NOT enforced in Cloud Functions** (allows bypass)

**Quick Links:**

- [Production Enforcement Steps](#-production-setup) ⚠️ **START HERE**
- [Testing Checklist](#4-production-checklist-complete-before-enforcement)
- [Rollback Plan](#2-rollback-plan-critical---prepare-before-enforcement)
- [Troubleshooting](#-troubleshooting)

---

## 📱 Platform Configuration

### iOS - DeviceCheck Provider

DeviceCheck is Apple's built-in attestation service (no setup required on device).

**Steps:**

1. **Enable DeviceCheck in Firebase Console**

   - Go to Firebase Console → Project Settings → App Check
   - Register your iOS app
   - Select "DeviceCheck" as the provider
   - No additional configuration needed

2. **Verify Bundle ID matches**
   - iOS Bundle ID: `com.socialcirclellc.app`
   - Must match exactly in Firebase Console and Xcode

### Android - Play Integrity Provider

Play Integrity replaces SafetyNet for newer Android apps.

**Steps:**

1. **Link to Google Play Console**

   - Go to Firebase Console → Project Settings → App Check
   - Register your Android app
   - Select "Play Integrity" as the provider
   - Link to your Google Play Console project

2. **Verify Package Name**

   - Android Package: `com.socialcirclellc.app`
   - Must match in Firebase Console and `android/app/build.gradle`

3. **Configure SHA-256 Fingerprints**

   ```bash
   # Get debug keystore fingerprint
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

   # Get release keystore fingerprint
   keytool -list -v -keystore /path/to/release.keystore -alias your-key-alias
   ```

   - Add both debug and release SHA-256 fingerprints to Firebase Console

---

## 🧪 Development Mode

### Debug Tokens (Auto-Generated)

In `__DEV__` mode, the app uses debug tokens to bypass native attestation:

```javascript
// src/services/firebase/config.js (already configured)
android: {
  provider: 'debug',
  debugToken: process.env.FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID || 'auto',
},
apple: {
  provider: 'debug',
  debugToken: process.env.FIREBASE_APPCHECK_DEBUG_TOKEN_IOS || 'auto',
}
```

**To get debug tokens:**

1. Run the app on a simulator/emulator
2. Check console logs for debug token (logged on first launch)
3. Add tokens to Firebase Console → App Check → Apps → Manage Debug Tokens
4. (Optional) Set environment variables in `.env` file:
   ```
   FIREBASE_APPCHECK_DEBUG_TOKEN_IOS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
   ```

---

## 🚀 Production Setup

### ⚠️ CRITICAL: App Check Currently NOT ENFORCED

**Current Status:**

- ✅ SDK initialized in app (dev + prod)
- ❌ **NOT enforced in Firebase Console** (allows unauthenticated access)
- ❌ **NOT enforced in Cloud Functions** (`enforceAppCheck: false`)

**Security Risk:** Without enforcement, attackers can bypass App Check entirely and access your Firebase resources directly via HTTP requests.

---

### 1. Enable App Check Enforcement in Firebase Console

**IMPORTANT:** Complete ALL steps below BEFORE enabling enforcement to avoid breaking the app.

#### Step 1A: Configure iOS App Check

1. **Firebase Console** → Project Settings → App Check
2. Click **"Add app"** or select existing iOS app
3. **Provider:** Select **"DeviceCheck"**
4. **Bundle ID:** Verify `com.socialcirclellc.app` matches exactly
5. Click **"Save"**
6. ✅ iOS app is now registered (not enforced yet)

#### Step 1B: Configure Android App Check

1. **Firebase Console** → Project Settings → App Check
2. Click **"Add app"** or select existing Android app
3. **Provider:** Select **"Play Integrity API"**
4. **Package name:** Verify `com.socialcirclellc.app` matches exactly
5. **SHA-256 Fingerprints:** Add BOTH debug and release certificates:

   ```bash
   # Get release keystore SHA-256 (REQUIRED)
   keytool -list -v -keystore /path/to/your-release.keystore -alias your-key-alias

   # Copy the SHA-256 fingerprint and add to Firebase Console
   ```

6. **Link Google Play Console** (if publishing to Play Store)
7. Click **"Save"**
8. ✅ Android app is now registered (not enforced yet)

---

#### Step 1C: Test on Real Devices FIRST

**DO NOT SKIP THIS STEP!** App Check only works on physical devices in production builds.

```bash
# Build production iOS app
npm run ios:device -- --configuration Release

# Build production Android app
cd android && ./gradlew assembleRelease
```

**Test Checklist:**

- [ ] iOS: Test on real iPhone/iPad (DeviceCheck doesn't work on simulators)
- [ ] Android: Test on real device with Google Play Services
- [ ] Verify all flows work: login, create event, RSVP, upload photo
- [ ] Check Firebase Console → App Check → Metrics for token issuance
- [ ] Monitor for any "App Check token is invalid" errors

---

#### Step 1D: Enable Enforcement in Firebase Console

**Only after successful real device testing:**

**Firestore:**

1. Firebase Console → Firestore Database → Settings (gear icon)
2. Scroll to **"App Check"** section
3. Click **"Enforce App Check"**
4. Confirm the warning dialog
5. ✅ Firestore now requires valid App Check tokens

**Storage:**

1. Firebase Console → Storage → Rules tab
2. Add App Check enforcement to rules:
   ```javascript
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if request.auth != null && request.app != null;
         // request.app checks App Check token validity
       }
     }
   }
   ```
3. Click **"Publish"**

**Cloud Functions:**

1. Edit `functions/index.js`
2. Change ALL callable functions from `enforceAppCheck: false` to `enforceAppCheck: true`:

   ```javascript
   // BEFORE (current - insecure)
   exports.rsvpEvent = onCall({
     region: 'us-central1',
     enforceAppCheck: false, // ❌ INSECURE
   }, async (req) => { ... });

   // AFTER (production-ready)
   exports.rsvpEvent = onCall({
     region: 'us-central1',
     enforceAppCheck: true, // ✅ SECURE
   }, async (req) => { ... });
   ```

3. Deploy updated functions:

   ```bash
   firebase deploy --only functions
   ```

4. ✅ Functions now require valid App Check tokens

---

#### Step 1E: Verify Enforcement is Active

**Check Firebase Console:**

- App Check → Overview → Should show "Enforced" for all services
- App Check → Metrics → Monitor token validation success rate (should be ~100%)

**Monitor Logs:**

- Cloud Functions logs should NOT show App Check errors
- If you see "UNAUTHENTICATED" errors, App Check tokens are failing

---

### 2. Rollback Plan (CRITICAL - Prepare Before Enforcement)

**If users report issues after enabling enforcement:**

#### Quick Rollback (5 minutes):

1. **Disable Firestore enforcement:**

   - Firebase Console → Firestore → Settings → Turn OFF "Enforce App Check"

2. **Disable Storage enforcement:**

   - Firebase Console → Storage → Rules → Remove `request.app != null` check

3. **Disable Functions enforcement:**

   ```bash
   # Revert functions/index.js to enforceAppCheck: false
   firebase deploy --only functions
   ```

4. **Monitor:** Check Firebase Console → App Check → Metrics to see if requests resume

#### Debug Mode (Temporary):

If enforcement must stay enabled but app is broken:

1. Generate debug tokens on affected devices
2. Add debug tokens to Firebase Console → App Check → Manage Debug Tokens
3. Ask users to restart the app

---

### 3. Gradual Rollout Strategy (RECOMMENDED)

**Phase 1: Metrics-Only Mode (Week 1)**

**Phase 1: Metrics-Only Mode (Week 1)**

- Register apps in App Check (Step 1A-1B above)
- **DO NOT enforce** in Firebase Console
- Monitor Firebase Console → App Check → Metrics
- Look for:
  - Token issuance rate (~95%+ expected)
  - Failed attestations (investigate if >5%)
  - Suspicious traffic patterns

**Phase 2: Enforce Functions Only (Week 2)**

- Enable `enforceAppCheck: true` for NON-CRITICAL functions first:
  - ✅ `rateUser`, `createReport`, `deleteEvent` (low-traffic)
  - ❌ Wait on `rsvpEvent`, `createEvent`, `sendMessage` (high-traffic)
- Deploy and monitor error rates for 48 hours
- If stable (<1% errors), proceed to Phase 3

**Phase 3: Full Functions Enforcement (Week 3)**

- Enable `enforceAppCheck: true` for ALL functions
- Deploy during low-traffic hours (e.g., 2am PST)
- Monitor crash analytics and user reports for 24 hours

**Phase 4: Firestore + Storage Enforcement (Week 4)**

- Enable enforcement in Firebase Console (Step 1D)
- Monitor for 1 week before considering "complete"
- Have rollback plan ready (Step 2 above)

---

### 4. Production Checklist (Complete Before Enforcement)

**Pre-Flight:**

- [ ] iOS app registered in App Check with DeviceCheck
- [ ] Android app registered in App Check with Play Integrity
- [ ] Release SHA-256 fingerprints added to Firebase Console
- [ ] Tested on real iOS device (production build)
- [ ] Tested on real Android device (production build)
- [ ] Verified token issuance in Firebase Console metrics (>95%)
- [ ] Rollback plan documented and team trained
- [ ] Monitoring dashboard ready (Firebase Console + crash analytics)

**During Rollout:**

- [ ] Phase 1: Metrics-only mode (1 week)
- [ ] Phase 2: Non-critical functions enforced (2-3 days)
- [ ] Phase 3: All functions enforced (1 week)
- [ ] Phase 4: Firestore + Storage enforced (ongoing)

**Post-Enforcement:**

- [ ] Monitor token validation success rate (should stay >98%)
- [ ] Check for UNAUTHENTICATED errors in function logs
- [ ] Review user reports for "can't connect" issues
- [ ] Document any edge cases or issues found

---

### 5. Common Gotchas

**❌ Don't enforce before testing on real devices**

- Simulators/emulators don't support DeviceCheck/Play Integrity
- Debug tokens work differently than production tokens

**❌ Don't enforce without SHA-256 fingerprints**

- Android apps will fail attestation immediately
- Must add BOTH debug and release keystore fingerprints

**❌ Don't enforce all services at once**

- Start with functions only
- Add Firestore/Storage after confirming stability

**❌ Don't forget to update Storage rules**

- Default rules don't check `request.app`
- Must manually add App Check validation

**✅ Do monitor metrics for 1+ week before enforcing**

- Identifies configuration issues early
- Allows time to fix attestation failures

**✅ Do have a rollback plan ready**

- Practice disabling enforcement before you need to
- Document steps for on-call engineers

---

## 🛠 Configuration Reference

### Current Implementation

**File:** `src/services/firebase/config.js`

```javascript
// Development: Uses debug provider
if (__DEV__) {
  const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider();
  rnfbProvider.configure({
    android: { provider: 'debug', debugToken: '...' },
    apple: { provider: 'debug', debugToken: '...' },
  });
  appCheck().initializeAppCheck({
    provider: rnfbProvider,
    isTokenAutoRefreshEnabled: true,
  });
}

// Production: Uses native providers
else {
  const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider();
  rnfbProvider.configure({
    android: { provider: 'playIntegrity' },
    apple: { provider: 'deviceCheck' },
  });
  appCheck().initializeAppCheck({
    provider: rnfbProvider,
    isTokenAutoRefreshEnabled: true,
  });
}
```

### Functions Configuration

**File:** `functions/index.js`

Currently all callables have:

```javascript
{
  enforceAppCheck: false, // TODO: Change to true after testing
}
```

**Search and replace when ready:**

```bash
# Find all occurrences
grep -n "enforceAppCheck: false" functions/index.js

# Update to true after testing
```

---

## 🐛 Troubleshooting

### "App Check token is invalid"

**Cause:** Debug token not registered or expired

**Fix:**

1. Get new debug token from console logs
2. Register in Firebase Console → App Check → Manage Debug Tokens
3. Restart app

### "Play Integrity API error"

**Cause:** SHA-256 fingerprint mismatch or app not linked to Play Console

**Fix:**

1. Verify SHA-256 fingerprints in Firebase Console
2. Ensure app is linked to Google Play Console
3. Wait up to 24 hours for Play Console sync

### "DeviceCheck unavailable"

**Cause:** iOS simulator or jailbroken device

**Fix:**

- DeviceCheck only works on real, non-jailbroken devices
- Use debug tokens for development
- Test on physical iPhone/iPad

---

## 📊 Monitoring

### Firebase Console Metrics

- App Check → Metrics → View token counts
- Monitor success/failure rates
- Track enforcement violations

### Logs

Development logs show App Check status:

```
🔐 [Firebase App Check] Initialized with debug provider (DEV)
🔐 [Firebase App Check] Initialized with native providers (PROD)
```

---

## ✅ Summary Checklist

### Current Status (December 2025):

- ✅ App Check SDK installed and configured
- ✅ Development mode using debug tokens
- ✅ Production mode configured for DeviceCheck (iOS) + Play Integrity (Android)
- ❌ **NOT ENFORCED** in Firebase Console (security risk)
- ❌ **NOT ENFORCED** in Cloud Functions (`enforceAppCheck: false`)

### Before Production Launch (CRITICAL):

**Week 1 - Testing:**

- [ ] Build production iOS app and test on real iPhone/iPad
- [ ] Build production Android app and test on real device
- [ ] Verify all user flows work with App Check tokens
- [ ] Register iOS app in Firebase Console (DeviceCheck)
- [ ] Register Android app in Firebase Console (Play Integrity)
- [ ] Add SHA-256 fingerprints for Android release keystore
- [ ] Monitor Firebase Console → App Check → Metrics (should show token issuance)

**Week 2 - Functions Enforcement:**

- [ ] Update 2-3 non-critical functions to `enforceAppCheck: true`
- [ ] Deploy and monitor for 48 hours
- [ ] Check function logs for UNAUTHENTICATED errors (should be 0)
- [ ] If stable, update ALL functions to `enforceAppCheck: true`
- [ ] Deploy during low-traffic hours
- [ ] Monitor for 1 week

**Week 3-4 - Full Enforcement:**

- [ ] Enable Firestore enforcement in Firebase Console
- [ ] Update Storage rules to check `request.app != null`
- [ ] Monitor token validation success rate (target: >98%)
- [ ] Test rollback procedure (practice disabling enforcement)
- [ ] Document any issues found
- [ ] Set up alerts for App Check failures

**Ongoing:**

- [ ] Monitor App Check metrics weekly
- [ ] Rotate debug tokens monthly
- [ ] Review Firebase Console for abuse patterns
- [ ] Keep rollback plan updated and accessible

---

## 🚨 PRODUCTION LAUNCH BLOCKER

**This is a P0 security issue.** App Check enforcement MUST be enabled before public launch to prevent:

- Unauthorized API access
- Quota theft and cost overruns
- Spam and bot abuse
- Direct Firestore/Storage access bypassing security rules

**Estimated time to complete enforcement:** 2-4 weeks (including testing and gradual rollout)

**Recommended timeline:**

- Start Phase 1 (metrics-only) immediately
- Complete full enforcement before marketing push or App Store feature

---

## 📚 References

- [React Native Firebase - App Check Documentation](https://rnfirebase.io/app-check/usage)
- [Firebase App Check Official Docs](https://firebase.google.com/docs/app-check)
- [Play Integrity API Setup](https://firebase.google.com/docs/app-check/android/play-integrity-provider)
- [DeviceCheck Setup](https://firebase.google.com/docs/app-check/ios/devicecheck-provider)
