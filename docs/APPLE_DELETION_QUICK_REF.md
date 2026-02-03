# Apple Account Deletion - Quick Reference

## For Users

**How to delete your account:**

1. Open Social Circle app
2. Go to Profile tab
3. Tap menu (3 dots) → Settings
4. Scroll to bottom → "Delete Account"
5. Read warning and confirm

**What happens:**

- Account permanently deleted within 24 hours
- All events, messages, and content removed
- Cannot be undone
- Can create new account with different email

**Support:** support@findyourcircle.app

---

## For Developers

### Testing Deletion Flow (Local)

```bash
# 1. Start emulators
npm run start

# 2. In another terminal, test function
firebase emulators:start --only functions

# 3. Run tests
npm test -- accountDeletion.test.js
```

### Testing Deletion Flow (Device)

1. Create test account
2. Add some events/messages
3. Navigate to Profile → Menu → Delete Account
4. Confirm deletion
5. Verify:
   - User signed out
   - Cannot login with deleted credentials
   - Events removed from map
   - Messages deleted

### Deploying Cloud Function

```bash
# Deploy only deletion function
firebase deploy --only functions:deleteUserAccount

# Deploy all functions
firebase deploy --only functions
```

### Monitoring Deletion Requests

```bash
# View logs
firebase functions:log --only deleteUserAccount

# Real-time logs
firebase functions:log --only deleteUserAccount --limit 10
```

### What Gets Deleted

- ✅ User document (`users/{uid}`)
- ✅ Firebase Auth user
- ✅ User's events (`events` where `createdBy == uid`)
- ✅ User's messages (`messages` where `senderId == uid`)
- ✅ User's chats (`chats` where user in `members`)
- ✅ User removed from event attendees
- ✅ Storage files (`users/{uid}/*`)
- ✅ Apple tokens (attempted revocation)

### What's NOT Deleted (Intentional)

- ❌ Abuse reports (safety/legal)
- ❌ Anonymized analytics (operational)
- ❌ Data required by law

### Error Scenarios

**"Failed to delete account"**

- Check cloud function logs
- Verify user is authenticated
- Check Firebase permissions
- Ensure function deployed

**"Permission denied"**

- User must be signed in
- Can only delete own account
- Check auth state

**Apple token revocation fails**

- Non-critical, deletion continues
- Check logs for details
- Full implementation needs Apple credentials

### Future Implementation: Full Apple Token Revocation

**Required:**

1. Apple Team ID
2. Key ID
3. Private Key (p8 file from Apple Developer)

**Implementation:**

```javascript
// In functions/index.js revokeAppleToken()
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

const clientSecret = jwt.sign(
  {
    iss: APPLE_TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
    aud: 'https://appleid.apple.com',
    sub: 'com.socialcirclellc.app',
  },
  APPLE_PRIVATE_KEY,
  {
    algorithm: 'ES256',
    header: { kid: APPLE_KEY_ID },
  },
);

await fetch('https://appleid.apple.com/auth/revoke', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: 'com.socialcirclellc.app',
    client_secret: clientSecret,
    token: authorizationCode,
    token_type_hint: 'refresh_token',
  }),
});
```

### Firestore Security Rules

Ensure rules allow deletion:

```javascript
// users collection
match /users/{userId} {
  allow delete: if request.auth != null && request.auth.uid == userId;
}

// events collection
match /events/{eventId} {
  allow delete: if request.auth != null &&
                   request.auth.uid == resource.data.createdBy;
}
```

### Support Requests

If user reports deletion not working:

1. Check Firebase logs for their UID
2. Verify function executed
3. Check for any failed steps
4. If all else fails, manual deletion:
   ```bash
   firebase auth:delete USER_UID
   # Then delete Firestore doc manually in console
   ```

---

## Apple Compliance Checklist

Before App Store submission:

- [ ] Delete option visible in app settings
- [ ] Confirmation dialog warns of permanent deletion
- [ ] Privacy policy updated with deletion info
- [ ] Function deployed to production
- [ ] Test deletion on real device
- [ ] Verify Apple token capture (if using Sign in with Apple)
- [ ] Document data retention policy
- [ ] Support email listed in app

---

## Files Changed

- `functions/index.js` - Cloud function
- `src/features/events/components/ProfileScreen.js` - UI
- `src/features/auth/components/screens/AuthScreen.js` - Apple integration
- `src/features/profile/components/InfoArticleScreen.js` - Privacy policy
- `docs/APPLE_ACCOUNT_DELETION_COMPLIANCE.md` - Full documentation

## Questions?

See full docs: `/docs/APPLE_ACCOUNT_DELETION_COMPLIANCE.md`
