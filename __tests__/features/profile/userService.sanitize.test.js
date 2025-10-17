jest.mock('@react-native-firebase/auth', () => {
  const mockAuthInstance = {
    useEmulator: jest.fn(),
    settings: {},
  };
  const authFn = jest.fn(() => mockAuthInstance);
  authFn.AuthErrorCodes = {};
  return authFn;
});

jest.mock('@react-native-firebase/firestore', () => {
  const mockFieldValue = {
    serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
    arrayUnion: jest.fn((...values) => ({ _methodName: 'arrayUnion', values })),
    arrayRemove: jest.fn((...values) => ({
      _methodName: 'arrayRemove',
      values,
    })),
    delete: jest.fn(() => ({ _methodName: 'deleteField' })),
  };

  class MockGeoPoint {
    constructor(latitude, longitude) {
      this.latitude = latitude;
      this.longitude = longitude;
    }
    isEqual() {
      return false;
    }
  }

  const mockInstance = {
    useEmulator: jest.fn(),
    settings: jest.fn(),
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
        update: jest.fn(),
        get: jest.fn(async () => ({ exists: false, data: () => ({}) })),
      })),
    })),
  };

  const firestoreFn = jest.fn(() => mockInstance);
  firestoreFn.FieldValue = mockFieldValue;
  firestoreFn.Timestamp = {
    fromDate: (date) => ({ date }),
  };
  firestoreFn.GeoPoint = MockGeoPoint;
  firestoreFn.CACHE_SIZE_UNLIMITED = 1048576;
  return firestoreFn;
});

jest.mock('@react-native-firebase/functions', () => {
  const mockInstance = {
    useEmulator: jest.fn(),
    httpsCallable: jest.fn(() => jest.fn()),
  };
  return jest.fn(() => mockInstance);
});

jest.mock('@react-native-firebase/storage', () => {
  const mockInstance = {
    useEmulator: jest.fn(),
    ref: jest.fn(() => ({
      putFile: jest.fn(),
      put: jest.fn(),
      getDownloadURL: jest.fn(async () => 'https://example.com'),
    })),
  };
  return jest.fn(() => mockInstance);
});

import { __userServiceInternals } from '../../../src/features/profile/services/userService';

const { sanitizeUserPayload, stripUnsupportedFirestoreValues } =
  __userServiceInternals;

describe('userService sanitization helpers', () => {
  it('removes restricted keys and undefined values', () => {
    const input = {
      premiumTier: 'gold',
      type: 'admin',
      firstName: 'Test',
      nickname: undefined,
      nested: {
        foo: undefined,
        bar: 'ok',
        deeper: {
          baz: undefined,
          qux: 'value',
        },
        arr: [1, undefined, { keep: 'yes', drop: undefined }],
      },
    };

    const result = sanitizeUserPayload(input);

    expect(result).toEqual({
      firstName: 'Test',
      nested: {
        bar: 'ok',
        deeper: { qux: 'value' },
        arr: [1, { keep: 'yes' }],
      },
    });
    expect(Object.prototype.hasOwnProperty.call(result, 'premiumTier')).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(result, 'type')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'nickname')).toBe(
      false
    );
  });

  it('preserves Firestore sentinel values', () => {
    const sentinel = { _methodName: 'serverTimestamp' };
    const wrapped = {
      createdAt: sentinel,
      list: [sentinel, null, undefined],
      nested: { when: sentinel },
    };

    const sanitized = stripUnsupportedFirestoreValues(wrapped);

    expect(sanitized.createdAt).toBe(sentinel);
    expect(sanitized.list[0]).toBe(sentinel);
    expect(sanitized.list.length).toBe(2); // drops undefined entry
    expect(sanitized.nested.when).toBe(sentinel);
  });
});
