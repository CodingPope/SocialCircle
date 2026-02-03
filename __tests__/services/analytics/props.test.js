// Description: Tests for analytics props derivation utilities
import { deriveUserAnalyticsProps } from '../../../src/services/analytics/props';

describe('deriveUserAnalyticsProps', () => {
  describe('basic functionality', () => {
    it('returns object for null user', () => {
      const result = deriveUserAnalyticsProps(null);
      expect(typeof result).toBe('object');
    });

    it('returns object for undefined user', () => {
      const result = deriveUserAnalyticsProps(undefined);
      expect(typeof result).toBe('object');
    });

    it('returns object for valid user', () => {
      const user = { uid: 'test-123' };
      const result = deriveUserAnalyticsProps(user);
      expect(typeof result).toBe('object');
    });
  });

  describe('plan derivation', () => {
    it('includes plan property for user with plan', () => {
      const user = { uid: 'test', plan: 'premium' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.plan).toBe('premium');
    });

    it('defaults plan to free when not specified', () => {
      const user = { uid: 'test' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.plan).toBe('free');
    });
  });

  describe('interests handling', () => {
    it('includes interests_count for user with interests', () => {
      const user = { uid: 'test', interests: ['Music', 'Sports', 'Art'] };
      const result = deriveUserAnalyticsProps(user);
      expect(result.interests_count).toBe('3');
    });

    it('handles empty interests array', () => {
      const user = { uid: 'test', interests: [] };
      const result = deriveUserAnalyticsProps(user);
      expect(result.interests_count).toBe('0');
    });

    it('handles missing interests', () => {
      const user = { uid: 'test' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.interests_count).toBe('0');
    });

    it('caps interests count at 99', () => {
      const user = {
        uid: 'test',
        interests: Array.from({ length: 150 }, (_, i) => `interest${i}`),
      };
      const result = deriveUserAnalyticsProps(user);
      expect(parseInt(result.interests_count, 10)).toBeLessThanOrEqual(99);
    });
  });

  describe('sex handling', () => {
    it('normalizes female gender', () => {
      const user = { uid: 'test', sex: 'female' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.sex).toBe('female');
    });

    it('normalizes male gender', () => {
      const user = { uid: 'test', sex: 'male' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.sex).toBe('male');
    });

    it('normalizes non-binary gender', () => {
      const user = { uid: 'test', sex: 'nonbinary' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.sex).toBe('non_binary');
    });

    it('defaults to unknown when not provided', () => {
      const user = { uid: 'test' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.sex).toBe('unknown');
    });
  });

  describe('home city', () => {
    it('includes home_city from city field', () => {
      const user = { uid: 'test', city: 'San Francisco' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.home_city).toBe('San Francisco');
    });

    it('includes home_city from location.city', () => {
      const user = { uid: 'test', location: { city: 'Los Angeles' } };
      const result = deriveUserAnalyticsProps(user);
      expect(result.home_city).toBe('Los Angeles');
    });

    it('handles missing home city', () => {
      const user = { uid: 'test' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.home_city).toBeUndefined();
    });

    it('truncates long city names', () => {
      const user = { uid: 'test', city: 'A'.repeat(50) };
      const result = deriveUserAnalyticsProps(user);
      expect(result.home_city.length).toBeLessThanOrEqual(24);
    });
  });

  describe('age bracket', () => {
    it('derives age bracket from dob', () => {
      // Create a date that makes user 25 years old
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 25);
      const user = { uid: 'test', dob };
      const result = deriveUserAnalyticsProps(user);
      expect(result.age_bracket).toBe('25_34');
    });

    it('handles missing dob', () => {
      const user = { uid: 'test' };
      const result = deriveUserAnalyticsProps(user);
      expect(result.age_bracket).toBeUndefined();
    });
  });

  describe('push opt in', () => {
    it('includes push_opt_in true when enabled', () => {
      const user = { uid: 'test', pushOptIn: true };
      const result = deriveUserAnalyticsProps(user);
      expect(result.push_opt_in).toBe('true');
    });

    it('includes push_opt_in false when disabled', () => {
      const user = { uid: 'test', pushOptIn: false };
      const result = deriveUserAnalyticsProps(user);
      expect(result.push_opt_in).toBe('false');
    });
  });

  describe('all properties are strings', () => {
    it('converts all values to strings for Firebase', () => {
      const user = {
        uid: 'test',
        plan: 'premium',
        interests: ['Music'],
        pushOptIn: true,
      };
      const result = deriveUserAnalyticsProps(user);

      Object.values(result).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });
  });
});
