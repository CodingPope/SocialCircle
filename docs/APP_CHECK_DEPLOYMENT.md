# App Check Production Deployment Guide

## ✅ Code Changes Complete

**Status**: App Check enforcement is now enabled in code but NOT YET deployed.

### Changes Made (Dec 18, 2025):

1. ✅ **Cloud Functions** - `enforceAppCheck: true` for all user-facing callables
2. ✅ **Storage Rules** - `hasAppCheck()` validation on all write operations
3. ✅ **Functions Region** - Standardized to `us-central1` for all callables
4. ⚠️ **Console Enforcement** - Still needs to be enabled in Firebase Console

---

## 🚀 Deployment Steps

### Step 1: Deploy Storage Rules (Low Risk)

Storage rules won't break existing functionality since App Check is already initialized in the app.

```bash
# Deploy storage rules with App Check validation
firebase deploy --only storage

# Verify deployment
firebase deploy --only storage --dry-run
```

**Expected Result**: Storage rules now require valid App Check tokens for uploads.

---

### Step 2: Deploy Cloud Functions (Test First!)

**⚠️ CRITICAL**: Test on a real device BEFORE deploying to production!

#### 2A: Build Production App

```bash
# iOS - Build and install on real device
npm run ios:device -- --configuration Release

# Android - Build release APK
cd android && ./gradlew assembleRelease
adb install app/build/outputs/apk/release/app-release.apk
```

#### 2B: Test Critical Flows

On the production build on a REAL device (not simulator), test:

- [ ] Sign in / Sign up
- [ ] Create an event
- [ ] RSVP to an event
- [ ] Upload profile photo
- [ ] Upload event photo
- [ ] Send a message in event chat
- [ ] Delete an event

**Watch for errors like:**

- ❌ "App Check token is invalid"
- ❌ "UNAUTHENTICATED" on function calls
- ❌ Upload failures

**If any errors occur**: Fix before deploying functions!

#### 2C: Deploy Functions

```bash
# Deploy all functions with App Check enforcement
firebase deploy --only functions

# Monitor deployment
firebase functions:log --only rsvpEvent,deleteEvent,leaveEvent
```

**Rollback if needed:**

```bash
# Quickly revert to previous deployment
firebase functions:rollback rsvpEvent
```

---

### Step 3: Enable Firebase Console Enforcement (Optional)

**Note**: Code-level enforcement (`enforceAppCheck: true`) is sufficient. Console enforcement adds an extra layer.

#### Firestore (Optional - Already Protected by Function Rules)

1. Firebase Console → Firestore Database → Settings
2. Enable "Enforce App Check"
3. **Warning**: This affects ALL Firestore reads/writes, not just function calls

#### Cloud Functions Console (Already Enforced in Code)

✅ Functions are already enforced via `enforceAppCheck: true` in code.  
Console settings are redundant but can be enabled for visibility.

---

## 📊 Monitoring After Deployment

### Check Function Logs

```bash
# Watch for App Check errors
firebase functions:log --only rsvpEvent,deleteEvent,leaveEvent

# Look for these patterns:
# ✅ "App Check verification passed"
# ❌ "App Check token is invalid"
# ❌ "UNAUTHENTICATED"
```

### Firebase Console Metrics

1. Go to Firebase Console → App Check → Metrics
2. Monitor:
   - Token issuance rate (should be >95%)
   - Validation success rate (should be >98%)
   - Failed attestations (investigate if >2%)

### Crashlytics / Error Reporting

Monitor for:

- Function call failures
- Upload failures
- Authentication errors

---

## 🆘 Emergency Rollback

If users report widespread issues after deployment:

### Quick Rollback (5 minutes)

```bash
# 1. Rollback functions to previous version
firebase functions:rollback rsvpEvent
firebase functions:rollback deleteEvent
firebase functions:rollback leaveEvent
firebase functions:rollback requestToJoinEvent

# 2. Revert storage rules (if needed)
git revert HEAD  # Revert storage.rules changes
firebase deploy --only storage

# 3. Monitor logs
firebase functions:log
```

### Disable Console Enforcement (if enabled)

1. Firebase Console → Firestore → Settings → Turn OFF "Enforce App Check"
2. Firebase Console → Storage → Settings → Turn OFF "Enforce App Check"

---

## 🎯 Deployment Checklist

### Pre-Deployment

- [ ] Code changes reviewed and committed
- [ ] Production build tested on real iOS device (not simulator)
- [ ] Production build tested on real Android device (not emulator)
- [ ] All critical user flows verified working
- [ ] Firebase Console showing App Check token issuance (>95%)
- [ ] Team notified of deployment window

### During Deployment

- [ ] Deploy storage rules: `firebase deploy --only storage`
- [ ] Verify storage uploads still work in production app
- [ ] Deploy functions: `firebase deploy --only functions`
- [ ] Monitor function logs for 10 minutes
- [ ] Test RSVP flow on production app
- [ ] Check Firebase Console → App Check → Metrics

### Post-Deployment

- [ ] Monitor function logs for 24 hours
- [ ] Check crash analytics for new errors
- [ ] Review user reports for authentication issues
- [ ] Document any issues in APP_CHECK_SETUP.md
- [ ] Set calendar reminder to check metrics weekly

---

## 📝 What Changed in Code

### Cloud Functions (`functions/index.js`)

**Before:**

```javascript
exports.rsvpEvent = onCall({
  region: 'us-central1',
  enforceAppCheck: false, // ❌ Insecure
}, async (req) => { ... });
```

**After:**

```javascript
exports.rsvpEvent = onCall({
  region: 'us-central1',
  enforceAppCheck: true, // ✅ Secure
}, async (req) => { ... });
```

**Functions Updated:**

- `rsvpEvent` - Join event
- `leaveEvent` - Leave event
- `deleteEvent` - Delete event
- `requestToJoinEvent` - Request to join private event
- `acceptRsvpRequest` - Accept join request
- `declineRsvpRequest` - Decline join request
- All business-related functions (via `BUSINESS_CALLABLE_OPTIONS`)
- Verification functions (email, phone)

**Functions NOT Updated (Intentional):**

- `updateCategories` - Admin-only function for CLI scripts

---

### Storage Rules (`storage.rules`)

**Before:**

```javascript
function signedIn() { return request.auth != null; }

match /profileImages/{uid}/{file} {
  allow write: if signedIn() && request.auth.uid == uid;
}
```

**After:**

```javascript
function signedIn() { return request.auth != null; }
function hasAppCheck() { return request.app != null; }

match /profileImages/{uid}/{file} {
  allow write: if signedIn() && hasAppCheck() && request.auth.uid == uid;
}
```

**All write operations now require:**

1. Valid authentication (`signedIn()`)
2. Valid App Check token (`hasAppCheck()`)
3. Proper authorization (uid matching, event ownership, etc.)

---

## 🔐 Security Impact

### Before Deployment

❌ Anyone with Firebase API keys could call functions directly  
❌ Bots could spam your backend with fake requests  
❌ Quota theft possible via unauthorized API access

### After Deployment

✅ Only authentic app instances can call functions  
✅ Bot protection via DeviceCheck (iOS) / Play Integrity (Android)  
✅ Reduced risk of quota theft and abuse

---

## 📚 Additional Resources

- [APP_CHECK_SETUP.md](./APP_CHECK_SETUP.md) - Complete setup guide
- [Firebase App Check Docs](https://firebase.google.com/docs/app-check)
- [React Native Firebase - App Check](https://rnfirebase.io/app-check/usage)

---

**Last Updated**: December 18, 2025  
**Status**: Ready for deployment  
**Risk Level**: Medium (requires real device testing before deploy)
