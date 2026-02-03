// Description: Tests for analytics sanitize utilities (privacy-safe parameter handling)
import {
  sanitize,
  toNum,
  safeStr,
  maskUserId,
} from '../../../src/services/analytics/sanitize';

describe('sanitize', () => {
  describe('basic functionality', () => {
    it('returns empty object for null/undefined input', () => {
      expect(sanitize(null)).toEqual({});
      expect(sanitize(undefined)).toEqual({});
    });

    it('handles non-object input gracefully', () => {
      // Note: strings are iterable so Object.entries may enumerate characters
      // Numbers should return empty since they're not iterable
      expect(sanitize(123)).toEqual({});
    });

    it('passes through valid string properties', () => {
      const result = sanitize({ category: 'Music', status: 'active' });
      expect(result.category).toBe('Music');
      expect(result.status).toBe('active');
    });

    it('passes through valid number properties', () => {
      const result = sanitize({ count: 42, score: 3.14 });
      expect(result.count).toBe(42);
      expect(result.score).toBe(3.14);
    });

    it('skips null and undefined values', () => {
      // Note: 'keep' key doesn't contain 'id' so it won't be masked
      const result = sanitize({ keep: 'yes', empty: null, missing: undefined });
      expect(result.keep).toBe('yes');
      expect(result.empty).toBeUndefined();
      expect(result.missing).toBeUndefined();
    });
  });

  describe('PII filtering', () => {
    it('filters out email-related keys', () => {
      const result = sanitize({
        email: 'test@example.com',
        userEmail: 'user@test.com',
      });
      expect(result.email).toBeUndefined();
      expect(result.userEmail).toBeUndefined();
    });

    it('filters out phone-related keys', () => {
      const result = sanitize({
        phone: '123-456-7890',
        phoneNumber: '9876543210',
      });
      expect(result.phone).toBeUndefined();
      expect(result.phoneNumber).toBeUndefined();
    });

    it('filters out token-related keys', () => {
      const result = sanitize({ token: 'abc123', accessToken: 'xyz789' });
      expect(result.token).toBeUndefined();
      expect(result.accessToken).toBeUndefined();
    });

    it('filters out address-related keys', () => {
      const result = sanitize({ address: '123 Main St', homeAddress: 'Apt 4' });
      expect(result.address).toBeUndefined();
      expect(result.homeAddress).toBeUndefined();
    });

    it('filters out image/photo-related keys', () => {
      const result = sanitize({
        image: 'url',
        photoURL: 'avatar.jpg',
        profileImage: 'pic.png',
      });
      expect(result.image).toBeUndefined();
      expect(result.photoURL).toBeUndefined();
      expect(result.profileImage).toBeUndefined();
    });

    it('filters out name-related keys', () => {
      const result = sanitize({
        name: 'John',
        firstName: 'Jane',
        displayName: 'User',
      });
      expect(result.name).toBeUndefined();
      expect(result.firstName).toBeUndefined();
      expect(result.displayName).toBeUndefined();
    });
  });

  describe('ID masking', () => {
    it('masks ID fields with consistent hash', () => {
      const result = sanitize({ eventId: 'abc123', userId: 'xyz789' });
      expect(result.eventId).toBeDefined();
      expect(result.userId).toBeDefined();
      expect(result.eventId).not.toBe('abc123');
      expect(result.userId).not.toBe('xyz789');
    });

    it('produces consistent hash for same input', () => {
      const result1 = sanitize({ eventId: 'test123' });
      const result2 = sanitize({ eventId: 'test123' });
      expect(result1.eventId).toBe(result2.eventId);
    });

    it('produces different hash for different input', () => {
      const result1 = sanitize({ eventId: 'test123' });
      const result2 = sanitize({ eventId: 'test456' });
      expect(result1.eventId).not.toBe(result2.eventId);
    });
  });

  describe('key validation', () => {
    it('filters out keys starting with underscore', () => {
      const result = sanitize({ _private: 'value', keep: 'yes' });
      expect(result._private).toBeUndefined();
      expect(result.keep).toBe('yes');
    });

    it('filters out keys starting with firebase_', () => {
      const result = sanitize({ firebase_token: 'abc', keep: 'yes' });
      expect(result.firebase_token).toBeUndefined();
      expect(result.keep).toBe('yes');
    });

    it('filters out keys starting with google_', () => {
      const result = sanitize({ google_analytics: 'abc', keep: 'yes' });
      expect(result.google_analytics).toBeUndefined();
      expect(result.keep).toBe('yes');
    });

    it('filters out keys starting with ga_', () => {
      const result = sanitize({ ga_session: 'abc', keep: 'yes' });
      expect(result.ga_session).toBeUndefined();
      expect(result.keep).toBe('yes');
    });

    it('filters out keys with invalid characters', () => {
      const result = sanitize({
        'key-with-dash': 'value',
        'key.with.dot': 'value',
      });
      expect(result['key-with-dash']).toBeUndefined();
      expect(result['key.with.dot']).toBeUndefined();
    });

    it('filters out keys longer than 40 characters', () => {
      const longKey = 'a'.repeat(41);
      const validKey = 'a'.repeat(40);
      const result = sanitize({ [longKey]: 'value', [validKey]: 'yes' });
      expect(result[longKey]).toBeUndefined();
      expect(result[validKey]).toBe('yes');
    });
  });

  describe('location rounding', () => {
    it('rounds latitude to 1 decimal place', () => {
      const result = sanitize({ lat: 37.7749295 });
      expect(result.lat).toBe(37.8);
    });

    it('rounds longitude to 1 decimal place', () => {
      const result = sanitize({ lng: -122.4194155 });
      expect(result.lng).toBe(-122.4);
    });
  });

  describe('string truncation', () => {
    it('truncates strings longer than 100 characters', () => {
      const longString = 'a'.repeat(150);
      const result = sanitize({ description: longString });
      expect(result.description.length).toBe(100);
    });

    it('trims whitespace from strings', () => {
      const result = sanitize({ category: '  Music  ' });
      expect(result.category).toBe('Music');
    });

    it('skips empty strings after trimming', () => {
      const result = sanitize({ empty: '   ' });
      expect(result.empty).toBeUndefined();
    });
  });

  describe('array handling', () => {
    it('limits arrays to 10 items', () => {
      const longArray = Array.from({ length: 15 }, (_, i) => `item${i}`);
      const result = sanitize({ items: longArray });
      expect(result.items.length).toBe(10);
    });

    it('truncates string items in arrays to 40 characters', () => {
      const result = sanitize({ tags: ['a'.repeat(50)] });
      expect(result.tags[0].length).toBe(40);
    });
  });

  describe('object handling', () => {
    it('converts nested objects to [object] placeholder', () => {
      const result = sanitize({ nested: { foo: 'bar' } });
      expect(result.nested).toBe('[object]');
    });
  });
});

describe('toNum', () => {
  it('returns number for valid number input', () => {
    expect(toNum(42)).toBe(42);
    expect(toNum(3.14)).toBe(3.14);
    expect(toNum(0)).toBe(0);
    expect(toNum(-5)).toBe(-5);
  });

  it('returns 0 for non-number input', () => {
    expect(toNum('42')).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum({})).toBe(0);
  });

  it('returns 0 for Infinity and NaN', () => {
    expect(toNum(Infinity)).toBe(0);
    expect(toNum(-Infinity)).toBe(0);
    expect(toNum(NaN)).toBe(0);
  });
});

describe('safeStr', () => {
  it('returns string for valid string input', () => {
    expect(safeStr('hello')).toBe('hello');
  });

  it('truncates strings longer than 40 characters', () => {
    const longString = 'a'.repeat(50);
    expect(safeStr(longString).length).toBe(40);
  });

  it('converts non-strings to string', () => {
    expect(safeStr(42)).toBe('42');
    expect(safeStr(true)).toBe('true');
  });

  it('handles null/undefined gracefully', () => {
    expect(safeStr(null)).toBe('');
    expect(safeStr(undefined)).toBe('');
  });
});

describe('maskUserId', () => {
  it('masks user ID consistently', () => {
    const result1 = maskUserId('user123');
    const result2 = maskUserId('user123');
    expect(result1).toBe(result2);
  });

  it('produces different masks for different IDs', () => {
    const result1 = maskUserId('user123');
    const result2 = maskUserId('user456');
    expect(result1).not.toBe(result2);
  });

  it('returns null for empty/null input', () => {
    expect(maskUserId('')).toBeNull();
    expect(maskUserId(null)).toBeNull();
    expect(maskUserId(undefined)).toBeNull();
  });

  it('returns alphanumeric hash', () => {
    const result = maskUserId('testuser');
    expect(result).toMatch(/^[a-z0-9]+$/);
  });

  it('returns hash no longer than 16 characters', () => {
    const result = maskUserId('very-long-user-id-that-is-quite-long');
    expect(result.length).toBeLessThanOrEqual(16);
  });
});
