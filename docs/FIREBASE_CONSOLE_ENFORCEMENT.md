# Firebase Console - App Check Enforcement Guide

## ✅ Status: Functions Deployed with App Check

**Deployment Date**: December 18, 2025  
**Project**: social-scene1  
**Functions Deployed**: 54 functions with `enforceAppCheck: true`

---

## 🎯 What's Already Done

### ✅ Completed

- [x] Cloud Functions deployed with `enforceAppCheck: true`
- [x] Storage Rules deployed with `hasAppCheck()` validation
- [x] App Check SDK initialized in mobile app (dev + prod)

### ⚠️ Pending (This Guide)

- [ ] Register iOS app in Firebase Console (DeviceCheck)
- [ ] Register Android app in Firebase Console (Play Integrity)
- [ ] Test on real devices (iOS + Android)
- [ ] Monitor function logs for App Check errors
- [ ] Enable Firestore enforcement in console (optional)

---

## 📱 Step 1: Register Mobile Apps in Firebase Console

### iOS App Registration (DeviceCheck)

1. Go to [Firebase Console](https://console.firebase.google.com/project/social-scene1/appcheck) → App Check
2. Click **"Apps"** tab
3. Find your iOS app or click **"Add app"**
4. **Provider**: Select **"DeviceCheck"**
5. **Bundle ID**: Verify it matches `com.socialcirclellc.app` (check `ios/SocialCircle.xcodeproj`)
6. Click **"Save"**
7. ✅ iOS app is now registered

**Note**: DeviceCheck works automatically on real devices. No API keys needed.

---

### Android App Registration (Play Integrity)

1. Go to [Firebase Console](https://console.firebase.google.com/project/social-scene1/appcheck) → App Check
2. Click **"Apps"** tab
3. Find your Android app or click **"Add app"**
4. **Provider**: Select **"Play Integrity API"**
5. **Package name**: Verify it matches `com.socialcirclellc.app` (check `android/app/build.gradle`)

#### Get SHA-256 Fingerprints

**Debug Keystore** (for development):

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android
```

**Release Keystore** (for production):

```bash
# Replace with your actual keystore path and alias
keytool -list -v \
  -keystore /path/to/your-release.keystore \
  -alias your-key-alias
```

**Copy the SHA-256 fingerprint** (example: `AA:BB:CC:DD:...`) and add BOTH debug and release to Firebase Console.

6. Click **"Save"**
7. ✅ Android app is now registered

---

## 🧪 Step 2: Test on Real Devices (CRITICAL)

**⚠️ DO NOT SKIP**: App Check only works on physical devices, not simulators/emulators.

### iOS Testing

```bash
# Build production/release configuration
npm run ios:device -- --configuration Release

# Or build via Xcode:
# 1. Open ios/SocialCircle.xcworkspace in Xcode
# 2. Select a real device (not simulator)
# 3. Product → Scheme → Edit Scheme → Run → Release
# 4. Product → Run (⌘R)
```

**Test these critical flows:**

- [ ] Sign in / Sign up
- [ ] Create an event
- [ ] RSVP to an event
- [ ] Leave an event
- [ ] Upload profile photo
- [ ] Upload event photo
- [ ] Send a chat message
- [ ] Delete an event

**Watch for errors:**

- ❌ "App Check token is invalid"
- ❌ "UNAUTHENTICATED" on function calls
- ❌ Upload failures

---

### Android Testing

```bash
# Build release APK
cd android
./gradlew assembleRelease

# Install on connected device
adb install app/build/outputs/apk/release/app-release.apk

# Or debug variant for faster testing
./gradlew installDebug
```

**Test the same flows as iOS above.**

---

## 📊 Step 3: Monitor Function Logs

### Real-Time Monitoring

```bash
# Watch all function logs
firebase functions:log

# Watch specific functions
firebase functions:log --only rsvpEvent,deleteEvent,leaveEvent

# Continuous monitoring
firebase functions:log --since 1h
```

### What to Look For

**✅ Success indicators:**

```
App Check verification passed
Function completed successfully
```

**❌ Error indicators:**

```
UNAUTHENTICATED
App Check token is invalid
Request is missing required authentication credential
```

**If you see errors:**

1. Check that the app is registered in Firebase Console
2. Verify SHA-256 fingerprints are correct (Android)
3. Ensure you're testing on a **real device**, not simulator
4. Check app is using production build (not debug)

---

## 📊 Step 4: Check Firebase Console Metrics

1. Go to [Firebase Console](https://console.firebase.google.com/project/social-scene1/appcheck) → App Check → **Metrics**
2. Monitor:
   - **Token issuance rate** (should be >95% for registered apps)
   - **Validation success rate** (should be >98% in production)
   - **Failed attestations** (investigate if >2%)

---

## 🔐 Step 5: Enable Firestore Enforcement (Optional)

**Note**: This is OPTIONAL. Your functions already enforce App Check at the code level, which is sufficient. Firestore Console enforcement adds an extra layer but can be more difficult to debug.

### If You Want Console Enforcement:

1. Go to [Firebase Console](https://console.firebase.google.com/project/social-scene1/firestore) → Firestore Database
2. Click **Settings** (gear icon)
3. Scroll to **App Check** section
4. Click **"Enforce App Check"**
5. Confirm the warning

**⚠️ Warning**: This affects ALL Firestore reads/writes, including:

- Direct client SDK calls
- Reads in security rules
- Offline cache synchronization

**Recommendation**: Skip this step unless you have specific security requirements. Function-level enforcement is sufficient.

---

## 🆘 Emergency Rollback

If users report widespread issues after testing:

### Quick Disable (Functions)

```bash
# Revert functions to enforceAppCheck: false
git revert <commit-hash>  # Revert the App Check enforcement commit
firebase deploy --only functions
```

### Quick Disable (Firestore Console)

1. Firebase Console → Firestore → Settings
2. Turn OFF "Enforce App Check"

### Quick Disable (Storage Console)

1. Edit `storage.rules`
2. Remove `&& hasAppCheck()` from all rules
3. Deploy: `firebase deploy --only storage`

---

## 📋 Post-Deployment Checklist

### Day 1 (Immediately After Deployment)

- [ ] Monitor function logs for 2-4 hours
- [ ] Check for UNAUTHENTICATED errors
- [ ] Test all critical flows on real devices
- [ ] Verify App Check metrics show token issuance

### Week 1

- [ ] Monitor daily for error spikes
- [ ] Check App Check validation success rate (should be >98%)
- [ ] Review user reports for authentication issues
- [ ] Document any edge cases or issues

### Ongoing

- [ ] Weekly check of App Check metrics
- [ ] Monthly review of failed attestations
- [ ] Rotate debug tokens as needed
- [ ] Update SHA-256 fingerprints when releasing new builds

---

## 🎯 Success Criteria

**App Check is working correctly when:**

- ✅ Token issuance rate >95%
- ✅ Validation success rate >98%
- ✅ No UNAUTHENTICATED errors in function logs
- ✅ All user flows work normally on real devices
- ✅ No user reports of "can't connect" or authentication errors

---

## 📚 Additional Resources

- [Firebase App Check Docs](https://firebase.google.com/docs/app-check)
- [DeviceCheck Setup](https://firebase.google.com/docs/app-check/ios/devicecheck-provider)
- [Play Integrity Setup](https://firebase.google.com/docs/app-check/android/play-integrity-provider)
- [Troubleshooting Guide](./APP_CHECK_SETUP.md#-troubleshooting)

---

**Last Updated**: December 18, 2025  
**Status**: Functions deployed, awaiting device testing and console registration  
**Next Steps**: Register apps in Firebase Console and test on real devices
