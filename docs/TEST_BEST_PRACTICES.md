# Test Best Practices - Social Circle

## ✅ Current Test Status

**13 test suites total:**

- ✅ 11 passing
- ⏭️ 2 skipped (documented architectural limitations)

**47 tests total:**

- ✅ 45 passing
- ⏭️ 2 skipped

---

## 📋 Best Practices Followed

### 1. **Global Test Setup**

- `__tests__/setup.js` - Centralized configuration
- Sets `jest.setTimeout(10000)` for async operations
- Runs `jest.clearAllMocks()` before each test
- Configured via `setupFilesAfterEnv` in `package.json`

### 2. **Mock Organization**

- **Manual mocks** in `__mocks__/` directory
  - `@react-native-firebase/` - Firebase SDK mocks
  - `@react-native-async-storage/` - Storage mock
  - `sentry-expo.js` - Error reporting mock
- **Inline mocks** using `jest.mock()` for test-specific behavior

### 3. **Mock Patterns**

#### ✅ **Correct: Factory Function Pattern**

```javascript
jest.mock('../../src/features/events/utils/ttlCache', () => {
  const mockGetWithTTL = jest.fn(
    async (_key, fetcher, _ttl) => await fetcher()
  );
  return {
    getWithTTL: mockGetWithTTL,
    __mockGetWithTTL: mockGetWithTTL, // exposed for assertions
  };
});

// Import and use
import { __mockGetWithTTL as mockGetWithTTL } from '../../src/features/events/utils/ttlCache';
expect(mockGetWithTTL).toHaveBeenCalled();
```

#### ❌ **Incorrect: External Variable (Hoisting Issue)**

```javascript
// DON'T DO THIS - mockFn will be undefined due to hoisting
const mockFn = jest.fn();
jest.mock('./module', () => ({ fn: mockFn }));
```

### 4. **Test Structure**

- **Descriptive test names**: `it('wraps hot fetch in getWithTTL', ...)`
- **Proper setup/teardown**: `beforeEach()` for cleanup
- **Focused assertions**: Test one behavior per `it()` block

### 5. **Configuration**

```json
{
  "preset": "jest-expo",
  "testEnvironment": "node",
  "setupFilesAfterEnv": ["<rootDir>/__tests__/setup.js"],
  "watchman": false // Prevents macOS permission issues
}
```

---

## ⚠️ Known Architectural Limitations

### Singleton Pattern Conflicts with Testing

**Issue**: Firebase config creates singleton instances at module import:

```javascript
// src/services/firebase/config.js
export const functionsInstance = getFunctions(app);
export const firestoreInstance = getFirestore(app);
```

**Impact**: Cannot mock these per-test because they're created once at import time.

**Affected Tests** (currently skipped):

1. `__tests__/services/deleteEvent.test.js`
2. `__tests__/stores/rsvpEvent.test.js`

**TODO Comments** document the issue:

```javascript
describe.skip('deleteEvent callable wrapper', () => {
  // TODO: This test is skipped because the functionsInstance in config.js
  // is a singleton created at module import time, making it impossible to
  // mock per-test. To make this testable, we would need to:
  // 1. Use dependency injection (pass functions instance as parameter)
  // 2. Use a factory pattern instead of singleton exports
  // 3. Or test at integration level with Firebase emulator
```

### Recommended Refactor (Future)

**Option 1: Dependency Injection**

```javascript
// Before (singleton)
export async function deleteEvent(eventId, userId) {
  const callable = httpsCallable(functionsInstance, 'deleteEvent');
  // ...
}

// After (injectable)
export async function deleteEvent(
  eventId,
  userId,
  functions = functionsInstance
) {
  const callable = httpsCallable(functions, 'deleteEvent');
  // ...
}
```

**Option 2: Factory Pattern**

```javascript
export function createFirebaseServices() {
  return {
    functions: getFunctions(app),
    firestore: getFirestore(app),
  };
}
```

**Option 3: Integration Tests**
Use Firebase Local Emulator Suite for integration testing instead of unit mocks.

---

## 📦 Testing Dependencies

```json
{
  "@testing-library/react-native": "^13.2.0",
  "jest": "~29.7.0",
  "jest-expo": "~53.0.10"
}
```

---

## 🎯 Testing Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- __tests__/services/discoveryCache.test.js

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

---

## ✨ Key Takeaways

1. **Use factory functions in `jest.mock()`** to avoid hoisting issues
2. **Expose mock functions** via `__mockName` pattern for assertions
3. **Document architectural constraints** with TODO comments when tests can't be written
4. **Global setup** reduces boilerplate and ensures consistency
5. **Singleton patterns** are incompatible with per-test mocking - use dependency injection or integration tests instead

---

## 🔍 Related Files

- `/package.json` - Jest configuration
- `/__tests__/setup.js` - Global test setup
- `/__mocks__/` - Manual mocks directory
- `/docs/TESTING.md` - (Future) Comprehensive testing guide
