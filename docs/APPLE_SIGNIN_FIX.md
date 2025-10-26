# 🔧 Apple Sign-In Production Fix - Action Plan

**Date:** October 25, 2025  
**Issue:** Apple Sign-In failing with "Something went wrong"  
**Immediate Actions Required**

---

## 🚀 **IMMEDIATE FIX DEPLOYED**

### Changes Made to Code

1. ✅ **Added Detailed Error Logging**

   - File: `src/features/auth/components/screens/AuthScreen.js`
   - Now logs: error code, message, nativeError, full error object
   - Will show exactly what's failing

2. ✅ **Added Apple-Specific Error Messages**
   - File: `src/features/auth/utils/authErrorHandler.js`
   - New error codes handled:
     - `auth/invalid-verification-code`
     - `auth/invalid-verification-id`
     - `auth/missing-verification-code`
     - `auth/missing-verification-id`

---

## 🎯 **NEXT STEPS FOR YOU**

### Step 1: Test and Get Error Details (5 min)

1. **Build and run the updated code:**

   ```bash
   npx expo run:ios --device
   ```

2. **Try Apple Sign-In**

3. **Check Console Output** - Look for:

   ```
   [Apple Sign-In] Error details: {
     code: "...",      ← This is what we need!
     message: "...",
     nativeError: "...",
     fullError: {...}
   }
   ```

4. **Share the error code** - This will tell us exactly what's wrong

---

### Step 2: Check Firebase Console (10 min)

**Most Likely Issue: Firebase Apple Provider Not Configured**

1. Go to: https://console.firebase.google.com
2. Select project: **social-scene1**
3. Navigate: **Authentication** → **Sign-in method**
4. Find **Apple** provider
5. Click **Apple** row

**Check These Settings:**

✅ **Enabled:** Should be ON (blue toggle)

✅ **Service IDs:** Should include:

```
com.socialcirclellc.app
```

✅ **OAuth redirect URL:** Should be set (auto-generated)

✅ **Team ID:** Should match your Apple Developer Team

```
H356K2BJT5
```

✅ **Key ID:** Should be filled (from Apple Developer Portal)

✅ **Private Key:** Should show "Uploaded" status

**If Any Are Missing:**

Click **Edit** and fill in the missing information.

---

### Step 3: Verify Apple Developer Portal (15 min)

1. Go to: https://developer.apple.com
2. Navigate: **Certificates, Identifiers & Profiles**

**Check App ID:**

1. Click **Identifiers** → **App IDs**
2. Find: `com.socialcirclellc.app`
3. Verify:
   - ✅ **Bundle ID:** com.socialcirclellc.app
   - ✅ **Capability:** Sign In with Apple (checked)
   - ✅ **Configuration:** Click "Edit" → Ensure configured as "Primary App ID"

**Check Service ID (if exists):**

1. Click **Identifiers** → **Services IDs**
2. Look for: `com.socialcirclellc.app` or similar
3. Verify:
   - ✅ Sign In with Apple is enabled
   - ✅ Domains and URLs configured

**If No Service ID Exists:**
You may need to create one (Firebase might handle this automatically)

**Check Key for Sign In with Apple:**

1. Click **Keys**
2. Look for a key with "Sign In with Apple" enabled
3. If none exists, you need to create one:
   - Click **+** to create new key
   - Enable "Sign In with Apple"
   - Configure with your App ID
   - Download the .p8 file
   - Upload to Firebase Console

---

## 🔍 **Diagnosis Based on Error Code**

### If error code is `auth/invalid-credential`:

**Problem:** Firebase doesn't recognize the Apple credential  
**Fix:** Check Firebase Console Apple provider configuration

### If error code is `auth/invalid-verification-id`:

**Problem:** Nonce mismatch or token issue  
**Fix:** Verify certificate/key configuration in Firebase

### If error code is `auth/missing-verification-code`:

**Problem:** Identity token not sent to Firebase  
**Fix:** Check expo-apple-authentication is working correctly

### If error code is blank or undefined:

**Problem:** expo-apple-authentication failing before Firebase  
**Fix:** Check Apple Developer Portal configuration

### If error is "Apple Sign-In returned no identity token":

**Problem:** Apple's servers didn't return a token  
**Fix:**

- Ensure testing on real device (not simulator)
- Check iCloud is signed in on device
- Verify internet connection

---

## 📋 **Checklist**

### Firebase Console

- [ ] Apple provider is ENABLED
- [ ] Service ID is set to `com.socialcirclellc.app`
- [ ] Team ID is `H356K2BJT5`
- [ ] Key ID is filled
- [ ] Private key shows "Uploaded"

### Apple Developer Portal

- [ ] App ID `com.socialcirclellc.app` exists
- [ ] Sign In with Apple capability is enabled
- [ ] App ID is configured as Primary
- [ ] Key for Sign In with Apple exists
- [ ] Key is downloaded and uploaded to Firebase

### Xcode Project

- [ ] Open `SocialCircle.xcworkspace` in Xcode
- [ ] Select SocialCircle target
- [ ] Signing & Capabilities tab
- [ ] "Sign In with Apple" capability is present
- [ ] Team is set to correct account

### Testing

- [ ] Testing on REAL iOS device (not simulator)
- [ ] Device is signed into iCloud
- [ ] Build is Development or TestFlight (not simulator)
- [ ] Console logs are visible

---

## 🆘 **If You're Stuck**

### Common Quick Fixes

**Fix 1: Toggle Apple Provider**

```
Firebase Console → Authentication → Sign-in method
Click Apple → Toggle OFF → Save
Toggle ON → Save
Test again
```

**Fix 2: Regenerate Key**

```
Apple Developer Portal → Keys → Create New
Enable "Sign In with Apple"
Download .p8 file
Firebase Console → Upload new key
Test again
```

**Fix 3: Clean Build**

```bash
cd ios
rm -rf Pods Podfile.lock build
pod install
cd ..
npx expo run:ios --device
```

---

## 📞 **What to Share If Still Broken**

Please share:

1. **Console error output** (the `[Apple Sign-In] Error details:` log)
2. **Firebase Console screenshot** of Apple provider settings
3. **Device type** and iOS version
4. **Build type** (Development/TestFlight/Production)

This will help diagnose the exact issue.

---

## ✅ **Expected Timeline**

- **Error diagnosis:** 5-10 minutes (run app, get error code)
- **Firebase fix:** 10-15 minutes (if config issue)
- **Apple Portal fix:** 15-30 minutes (if key needs creation)
- **Testing:** 5 minutes

**Total:** 30-60 minutes to full fix

---

**Status:** Awaiting error details from your next test run 🔍
