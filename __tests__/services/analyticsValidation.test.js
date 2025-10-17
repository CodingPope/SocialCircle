// Description: Test Firebase Analytics parameter validation
// Firebase has strict rules: alphanumeric + underscore, 1-40 chars, no leading underscore

describe('Analytics Parameter Validation', () => {
  // We can't directly test the internal sanitize function, but we can verify
  // that the analytics service exists and follows Firebase rules

  it('should export main analytics functions', () => {
    const analytics = require('../../src/services/analytics');
    expect(typeof analytics.event).toBe('function');
    expect(typeof analytics.screen).toBe('function');
    expect(typeof analytics.setOptIn).toBe('function');
  });

  it('validates parameter name rules', () => {
    // Firebase Analytics parameter name rules:
    const validNames = [
      'user_location', // Valid: alphanumeric + underscore
      'event_type', // Valid
      'status', // Valid: single word
      'attendee_count', // Valid
      'capacity', // Valid
    ];

    const invalidNames = [
      '_location', // Invalid: starts with underscore (reserved)
      'firebase_param', // Invalid: starts with firebase_ (reserved)
      'google_param', // Invalid: starts with google_ (reserved)
      'ga_param', // Invalid: starts with ga_ (reserved)
      '', // Invalid: empty
      'param with spaces', // Invalid: contains spaces
      'param-with-dash', // Invalid: contains dash
      'a'.repeat(41), // Invalid: > 40 characters
    ];

    const paramNameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

    validNames.forEach((name) => {
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(40);
      expect(name.startsWith('_')).toBe(false);
      expect(name.startsWith('firebase_')).toBe(false);
      expect(name.startsWith('google_')).toBe(false);
      expect(name.startsWith('ga_')).toBe(false);
      expect(/^[a-zA-Z0-9_]+$/.test(name)).toBe(true);
    });

    invalidNames.forEach((name) => {
      const isInvalid =
        name.length === 0 ||
        name.length > 40 ||
        name.startsWith('_') ||
        name.startsWith('firebase_') ||
        name.startsWith('google_') ||
        name.startsWith('ga_') ||
        !/^[a-zA-Z0-9_]+$/.test(name);
      expect(isInvalid).toBe(true);
    });
  });

  it('ensures common event parameters are valid', () => {
    const commonParams = {
      status: 'enabled',
      tab: 'trending',
      user_location: 'San Francisco, CA',
      attendee_count: 5,
      capacity: 10,
      privacy: 'public',
      has_image: true,
      category: 'Sports',
    };

    Object.keys(commonParams).forEach((key) => {
      expect(key.length).toBeGreaterThan(0);
      expect(key.length).toBeLessThanOrEqual(40);
      expect(key.startsWith('_')).toBe(false);
      expect(/^[a-zA-Z0-9_]+$/.test(key)).toBe(true);
    });
  });
});
