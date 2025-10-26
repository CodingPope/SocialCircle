# 🔍 Apple Sign-In Debugging Guide

**Date:** October 25, 2025  
**Issue:** Apple Sign-In failing in production with "Something went wrong" error  
**Status:** Investigating

---

## 🚨 Current Error

User sees:

```
Login Failed
Something went wrong. Please try again.
```

This is a generic fallback error, which means we're not catching the specific error code from Firebase.

---

## ✅ What's Already Configured

### 1. App Entitlements (app.json)

```json
"entitlements": {
  "com.apple.developer.applesignin": ["Default"]
}
```

✅ Apple Sign In capability enabled

### 2. Code Implementation

- ✅ Using `expo-apple-authentication`
- ✅ Generating secure nonce with SHA256
- ✅ Creating OAuth credential for Firebase
- ✅ Handling user cancellation
- ✅ Account conflict handling

### 3. Error Handling

- ✅ Now logging detailed error info
- ✅ Added Apple-specific error messages

---

## 🔍 Common Causes & Solutions

### 1. **Firebase Console Configuration**

**Check in Firebase Console:**

1. Go to **Authentication** → **Sign-in method**
2. Ensure **Apple** provider is **ENABLED**
3. Check that Service IDs are configured correctly
4. Verify OAuth redirect URL is set

**Required Configuration:**

- **Service ID:** com.socialcirclellc.app (your bundle ID)
- **Team ID:** H356K2BJT5 (from Developer Portal)
- **Key ID:** From Apple Developer Portal
- **Private Key:** Uploaded to Firebase

**To Fix:**

```
1. Go to https://console.firebase.google.com
2. Select your project
3. Authentication → Sign-in method
4. Click on Apple
5. Ensure it's enabled
6. Add Service ID if missing
```

---

### 2. **Apple Developer Portal Configuration**

**Required Steps:**

1. **App ID Configuration**

   - Bundle ID: `com.socialcirclellc.app`
   - Capability: Sign In with Apple (enabled)
   - Edit: Configure as Primary App ID

2. **Service ID Creation** (if not exists)

   - Identifier: `com.socialcirclellc.app.service`
   - Enable: Sign In with Apple
   - Configure: Add your domain and redirect URL

3. **Key Creation** (if not exists)
   - Create Key for Sign In with Apple
   - Download .p8 file
   - Upload to Firebase Console

**To Check:**

```
1. Go to https://developer.apple.com
2. Certificates, Identifiers & Profiles
3. Identifiers → App IDs
4. Find com.socialcirclellc.app
5. Verify "Sign In with Apple" is enabled
```

---

### 3. **Xcode Project Configuration**

**Check Signing & Capabilities:**

```
1. Open Xcode workspace
2. Select SocialCircle target
3. Signing & Capabilities tab
4. Verify "Sign In with Apple" capability exists
5. Check Team is set correctly (H356K2BJT5)
```

**If missing:**

- Click "+ Capability"
- Add "Sign In with Apple"
- Rebuild project

---

### 4. **Nonce Generation Issue**

The code uses:

```javascript
const rawNonce = await generateNonce();
const hashed = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  rawNonce
);
```

**Potential Issue:** `generateNonce()` function might fail silently

**To Debug:** Check if nonce is being generated correctly

---

### 5. **Identity Token Missing**

The code checks:

```javascript
if (!credential || !credential.identityToken) {
  throw new Error('Apple Sign-In returned no identity token.');
}
```

**This could happen if:**

- Apple's servers are down
- Network connectivity issue
- App not properly registered with Apple

---

## 🛠 Debugging Steps

### Step 1: Enable Detailed Logging

The code now includes:

```javascript
console.error('[Apple Sign-In] Error details:', {
  code: err?.code,
  message: err?.message,
  nativeError: err?.nativeError,
  fullError: err,
});
```

**Action:** Run the app and check console for detailed error

### Step 2: Test on Device

Apple Sign-In doesn't work on simulator properly. Must test on:

- ✅ Real iOS device
- ✅ Signed into iCloud with Apple ID
- ✅ TestFlight or Development build

### Step 3: Check Firebase Logs

1. Go to Firebase Console
2. Authentication → Users
3. Check if any sign-in attempts are logged
4. Look for error messages

### Step 4: Verify Certificates

**In Firebase Console:**

1. Authentication → Sign-in method → Apple
2. Check certificate expiration
3. Ensure Service ID matches bundle ID
4. Verify Team ID and Key ID are correct

---

## 🔧 Quick Fixes to Try

### Fix 1: Re-enable Apple Provider in Firebase

```
1. Firebase Console → Authentication → Sign-in method
2. Click Apple
3. Toggle OFF then ON
4. Save
5. Test again
```

### Fix 2: Rebuild iOS App

```bash
cd ios
rm -rf Pods Podfile.lock build
pod install
cd ..
npx expo run:ios --device
```

### Fix 3: Check Bundle ID Match

Ensure these ALL match:

- ✅ app.json: `com.socialcirclellc.app`
- ✅ Firebase project bundle ID
- ✅ Apple Developer Portal App ID
- ✅ Xcode project bundle ID

### Fix 4: Regenerate Certificates

If certificates are old/expired:

1. Create new Key in Apple Developer Portal
2. Download .p8 file
3. Upload to Firebase Console
4. Update Team ID and Key ID

---

## 📝 What to Check Next

When you run the app with the new logging, look for:

### Expected Output (Success):

```
[Apple Sign-In] Credential received
[Firebase] signInWithCredential success
[User] New user created / Existing user signed in
```

### Error Output (Failure):

```
[Apple Sign-In] Error details: {
  code: "auth/????",  ← This tells us what's wrong
  message: "...",
  nativeError: "..."
}
```

**Common Error Codes:**

- `auth/invalid-credential` → Firebase config issue
- `auth/invalid-verification-id` → Nonce/token mismatch
- `auth/missing-verification-code` → Identity token not sent
- No code at all → expo-apple-authentication issue

---

## 🎯 Most Likely Causes (Ranked)

### 1. **Firebase Apple Provider Not Properly Configured** (80% likely)

- Service ID missing or incorrect
- Certificates expired
- Team ID/Key ID mismatch

### 2. **Testing on Simulator** (15% likely)

- Apple Sign-In requires real device
- Simulator doesn't have Apple ID signed in

### 3. **Bundle ID Mismatch** (5% likely)

- Firebase expects different bundle ID
- Service ID doesn't match

---

## ✅ Action Items

1. **Check error logs** with new logging added
2. **Verify Firebase Console** Apple provider is enabled
3. **Test on real iOS device** (not simulator)
4. **Verify certificates** in Firebase Console
5. **Check bundle ID consistency** across all platforms

---

## 📞 If Still Failing

Share the console output that includes:

```
[Apple Sign-In] Error details: { ... }
```

This will tell us exactly what's failing and where.

---

**Status:** Waiting for detailed error logs from next test run
