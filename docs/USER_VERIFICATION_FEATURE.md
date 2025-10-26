# User Verification Feature

## Overview

User verification system that allows users to verify their accounts via email or phone number. Verified accounts receive a blue checkmark badge on their profile.

---

## Components

### 1. Backend (Cloud Functions)

**Location:** `/functions/index.js`

Four new Cloud Functions for verification:

#### `requestEmailVerification`

- Generates a 6-digit verification code
- Stores code in `users/{uid}.verificationRequest` with 15-minute expiration
- Maximum 5 attempts before requiring a new request
- Sends email to user's registered email address
- **TODO:** Integrate SendGrid/AWS SES for production email delivery

#### `verifyEmailCode`

- Validates the 6-digit code against stored hash
- Checks expiration and attempt limits
- On success: Updates user document with:
  - `verified: true`
  - `verifiedAt: serverTimestamp()`
  - `verificationMethod: 'email'`
- Deletes verification request after successful verification

#### `requestPhoneVerification`

- Similar to email verification but for phone numbers
- 6-digit code with 10-minute expiration
- Stores phone number for verification
- **TODO:** Integrate Twilio for production SMS delivery

#### `verifyPhoneCode`

- Validates phone verification code
- On success: Updates user with:
  - `verified: true`
  - `verifiedAt: serverTimestamp()`
  - `verificationMethod: 'phone'`
  - `verifiedPhone: phoneNumber`

---

### 2. Client-Side Wrappers

**Location:** `/src/firebase/config.js`

Four async wrapper functions:

- `requestEmailVerification()` - Request email verification code
- `verifyEmailCode(code)` - Submit email verification code
- `requestPhoneVerification(phoneNumber)` - Request phone SMS code
- `verifyPhoneCode(code)` - Submit phone verification code

All use Firebase `httpsCallable()` pattern for seamless Cloud Function integration.

---

### 3. UI Components

#### VerificationModal

**Location:** `/src/features/profile/components/VerificationModal.js`

Multi-step modal for user verification flow:

**Steps:**

1. **Choose Method** - Email or Phone verification selection
2. **Phone Input** (if phone selected) - Enter phone number
3. **Code Input** - Enter 6-digit verification code

**Features:**

- Swipe-to-close modal
- Keyboard-aware layout
- 60-second resend cooldown timer
- Real-time code input with 6-digit validation
- Success/error handling with native alerts
- Automatic state reset on close

**UI Elements:**

- Method selection cards with icons
- Phone number input with validation
- Large 6-digit code input field
- Resend code button with countdown
- Loading states throughout flow

---

#### ProfileScreen Integration

**Location:** `/src/features/events/components/ProfileScreen.js`

**Changes:**

1. Added `VerificationModal` import
2. Added `showVerificationModal` state
3. Added "Get Verified" button in settings sidebar (above Dark Mode toggle)
4. Button only shows if user is NOT already verified
5. Added verification success handler that:
   - Updates local `verified` state
   - Refreshes user data from Firestore
   - Updates Zustand user store globally
6. Existing verified badge (blue checkmark) already displays in profile header

**Settings Button:**

- Icon: Blue checkmark circle (`checkmark-circle`)
- Position: Above "Dark Mode" toggle
- Visibility: Hidden when `verified === true`

---

## Security Features

### Rate Limiting

- **Email:** Max 5 attempts per request (15 min expiration)
- **Phone:** Max 5 attempts per request (10 min expiration)
- **Cooldown:** 60-second client-side resend cooldown

### Code Security

- 6-digit numeric codes
- Hashed with `crypto.createHash('sha256')`
- Stored with attempt counters
- Automatic expiration (15 min email, 10 min phone)
- Deleted after successful verification

### Validation

- Phone number format validation (minimum 10 digits)
- Code length validation (exactly 6 digits)
- Expiration timestamp checks
- Attempt limit enforcement

---

## User Flow

### Email Verification

1. User clicks "Get Verified" in profile settings
2. Modal opens with method selection
3. User clicks "Email Verification"
4. Backend generates code and sends email (logs to console in dev)
5. User enters 6-digit code from email
6. User clicks "Verify"
7. Backend validates code
8. On success: User document updated, verified badge appears
9. Modal closes with success message

### Phone Verification

1. User clicks "Get Verified" in profile settings
2. Modal opens with method selection
3. User clicks "Phone Verification"
4. User enters phone number
5. User clicks "Send Code"
6. Backend generates code and sends SMS (logs to console in dev)
7. User enters 6-digit code from SMS
8. User clicks "Verify"
9. Backend validates code
10. On success: User document updated with verified phone, badge appears
11. Modal closes with success message

---

## Database Schema

### Users Collection Update

New fields added to `users/{uid}`:

```js
{
  verified: false,           // Boolean - verified status
  verifiedAt: null,          // Timestamp - when verification completed
  verificationMethod: null,  // String - 'email' or 'phone'
  verifiedPhone: null,       // String - verified phone number (phone method only)
  verificationRequest: {     // Temporary object during verification
    codeHash: "abc123...",   // SHA256 hash of verification code
    createdAt: Timestamp,    // When code was generated
    expiresAt: Timestamp,    // When code expires
    attempts: 0,             // Number of failed attempts
    type: "email",           // 'email' or 'phone'
    phone: "+15551234567"    // Phone number (phone verification only)
  }
}
```

**Note:** `verificationRequest` is deleted after successful verification or expiration.

---

## TODO: Production Integration

### Email Service (Required for Production)

Current: Logs to Cloud Functions console
Needed: Integrate SendGrid, AWS SES, or similar

**Implementation:**

```js
// In requestEmailVerification function
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to: email,
  from: 'noreply@socialcircle.app',
  subject: 'Social Circle Verification Code',
  text: `Your verification code is: ${code}`,
  html: `<strong>Your verification code is: ${code}</strong>`,
};

await sgMail.send(msg);
```

### SMS Service (Required for Phone Verification)

Current: Logs to Cloud Functions console
Needed: Integrate Twilio

**Implementation:**

```js
// In requestPhoneVerification function
const twilio = require('twilio');
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

await client.messages.create({
  body: `Your Social Circle verification code is: ${code}`,
  from: process.env.TWILIO_PHONE_NUMBER,
  to: phoneNumber,
});
```

### Rate Limiting Enhancement

Consider adding IP-based rate limiting to prevent abuse:

- Track requests by IP address
- Limit to 3-5 verification requests per hour per IP
- Use Firebase Firestore or Redis for tracking

---

## Testing Checklist

### Manual Testing

- [ ] Email verification flow end-to-end
- [ ] Phone verification flow end-to-end
- [ ] Invalid code handling
- [ ] Expired code handling
- [ ] Resend code with cooldown
- [ ] Already verified user (should see no button)
- [ ] Verified badge displays correctly
- [ ] Modal swipe-to-close works
- [ ] Keyboard doesn't cover input fields

### Edge Cases

- [ ] Network failure during verification
- [ ] Multiple verification attempts (attempt limit)
- [ ] Closing modal mid-flow (state reset)
- [ ] Invalid phone number format
- [ ] Code with leading/trailing spaces

### Security Testing

- [ ] Cannot verify with expired code
- [ ] Cannot bypass attempt limits
- [ ] Cannot reuse verification codes
- [ ] Verified status persists across sessions

---

## Future Enhancements

### Additional Verification Methods

- Government ID verification (manual review)
- Social media account linking (LinkedIn, Facebook)
- Video selfie verification

### Verification Levels

- Basic: Email verified
- Enhanced: Phone verified
- Premium: ID verified

### User Benefits

- Verified badge on events they host
- Higher trust score in recommendations
- Access to premium features
- Filter events by verified hosts only

---

## Notes

- Verification is optional but recommended for trust
- Users can verify with either email OR phone (not both required)
- Verification status is permanent (cannot be un-verified)
- Badge appears in: Profile header, event cards (future), user search results (future)
- Code generation uses `Math.random()` - consider `crypto.randomInt()` for production
