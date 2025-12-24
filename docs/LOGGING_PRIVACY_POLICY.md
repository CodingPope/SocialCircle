# Logging & Privacy Policy

## 🔒 Privacy Rules (CRITICAL)

### ❌ NEVER LOG IN PRODUCTION:

1. **Authentication tokens** (JWT, refresh tokens, API keys)
2. **Full user identifiers** (UIDs, emails, phone numbers) combined with sensitive context
3. **Passwords** (even hashed)
4. **Personal data** (addresses, credit card info, etc.)
5. **Location coordinates** combined with user IDs

### ✅ SAFE TO LOG:

1. **Token metadata** (length, expiry, issuer - never the token itself)
2. **Generic error codes** without user context
3. **Aggregate metrics** (event count, query time)
4. **Sanitized user context** (e.g., "User authenticated" vs "User abc123@email.com authenticated")

---

## 📊 Log Levels

### Development (`__DEV__ === true`)

- **logger.debug()** - Verbose debugging info (initialization, state changes)
- **logger.info()** - Normal flow information
- **logger.warn()** - Unexpected but recoverable issues
- **logger.error()** - Critical errors requiring attention

### Production (`__DEV__ === false`)

- **logger.debug()** - ❌ Stripped (not logged)
- **logger.info()** - ❌ Stripped (not logged)
- **logger.warn()** - ✅ Logged (sent to error tracking)
- **logger.error()** - ✅ Logged (sent to error tracking)

---

## 🛠 Logger API

Located: `src/lib/logger.js`

```javascript
import logger from './lib/logger';

// Development only
logger.debug('Component mounted', { componentName: 'MapScreen' });
logger.info('User preferences loaded');

// Development + Production
logger.warn('API rate limit approaching', { endpoint: '/events' });
logger.error('Failed to fetch events', { code: 'network-error' });
```

---

## 🔧 Migration Guide

### Before (❌ Unsafe):

```javascript
console.log('[Firebase] User authenticated:', user.uid, user.email);
console.log('Token:', authToken);
console.log('Location:', coords.latitude, coords.longitude, user.uid);
```

### After (✅ Safe):

```javascript
logger.debug('[Firebase] User authenticated');
logger.debug('Token length:', authToken?.length || 0);
logger.debug('Location retrieved');
```

---

## 📋 Common Patterns

### Pattern 1: Initialization Logs

```javascript
// ❌ Before
console.log('[Firebase] Initializing Firebase configuration');

// ✅ After
logger.debug('[Firebase] Initializing configuration');
```

### Pattern 2: Error Logging

```javascript
// ❌ Before
console.error('Login failed for user:', userEmail, error);

// ✅ After
logger.error('Login failed', {
  code: error?.code,
  message: error?.message,
});
```

### Pattern 3: User Actions

```javascript
// ❌ Before
console.log('User', uid, 'joined event', eventId);

// ✅ After
logger.debug('User joined event');
// For production tracking, use analytics instead
analytics.logEvent('join_event', { event_id: eventId });
```

### Pattern 4: Debug/Test Files

```javascript
// Test files (testAuth.js, etc.)
// Use logger.debug() for all sensitive output
// These logs will be stripped in production builds

// ❌ Before
console.log('User ID:', user.uid);
console.log('Email:', user.email);

// ✅ After
logger.debug('User ID:', user.uid);
logger.debug('Email:', user.email);
```

---

## 🚨 Production Error Tracking

When using `logger.warn()` or `logger.error()` in production:

- Errors are logged to console
- Can be captured by error tracking services (Sentry, etc.)
- Should NOT include sensitive data

### Integration Example (Future):

```javascript
// In logger.js
error: (...args) => {
  const sanitized = sanitizeForProduction(args);
  console.error('[ERROR]', ...sanitized);

  if (!__DEV__) {
    // Send to error tracking
    Sentry.captureException(new Error(sanitized.join(' ')));
  }
};
```

---

## ✅ Checklist for New Code

Before merging code with logs:

- [ ] No raw tokens or credentials logged
- [ ] User IDs only in debug logs (not info/warn/error)
- [ ] Location data not combined with user identifiers
- [ ] Used `logger.debug()` instead of `console.log()` for dev-only logs
- [ ] Used `logger.error()` for production-safe error tracking
- [ ] Sensitive data sanitized before logging

---

## 📖 References

- Firebase Auth Best Practices: https://firebase.google.com/docs/auth/best-practices
- GDPR Logging Guidelines: https://gdpr.eu/logging/
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

---

**Last Updated**: December 16, 2025  
**Compliance**: GDPR, CCPA  
**Review Frequency**: Quarterly
