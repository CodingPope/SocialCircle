// Description: Unit tests for auth error handler
import {
  getAuthErrorMessage,
  isValidEmail,
  validatePassword,
} from '../../../src/features/auth/utils/authErrorHandler';

describe('authErrorHandler', () => {
  describe('getAuthErrorMessage', () => {
    it('should return friendly message for invalid-credential error', () => {
      const error = { code: 'auth/invalid-credential' };
      const { title, message } = getAuthErrorMessage(error, 'login');

      expect(title).toBe('Login Failed');
      expect(message).toContain('email or password');
      expect(message).not.toContain('auth/');
    });

    it('should return friendly message for email-already-in-use error', () => {
      const error = { code: 'auth/email-already-in-use' };
      const { title, message } = getAuthErrorMessage(error, 'signup');

      expect(title).toBe('Account Exists');
      expect(message).toContain('already exists');
    });

    it('should return friendly message for weak-password error', () => {
      const error = { code: 'auth/weak-password' };
      const { title, message } = getAuthErrorMessage(error, 'signup');

      expect(title).toBe('Weak Password');
      expect(message).toContain('6 characters');
    });

    it('should return friendly message for network error', () => {
      const error = { code: 'auth/network-request-failed' };
      const { title, message } = getAuthErrorMessage(error, 'login');

      expect(title).toBe('Connection Error');
      expect(message).toContain('internet connection');
    });

    it('should return friendly message for too-many-requests error', () => {
      const error = { code: 'auth/too-many-requests' };
      const { title, message } = getAuthErrorMessage(error, 'login');

      expect(title).toBe('Too Many Attempts');
      expect(message).toContain('wait');
    });

    it('should return generic message for unknown error codes', () => {
      const error = { code: 'auth/unknown-error-xyz' };
      const { title, message } = getAuthErrorMessage(error, 'login');

      expect(title).toBe('Login Failed');
      expect(message).toBe('Something went wrong. Please try again.');
    });

    it('should handle error without code', () => {
      const error = { message: 'Some error' };
      const { title, message } = getAuthErrorMessage(error, 'login');

      expect(title).toBe('Login Failed');
      expect(message).toBe('Something went wrong. Please try again.');
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.user@domain.co.uk')).toBe(true);
      expect(isValidEmail('name+tag@test.com')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('missing@domain')).toBe(false);
      expect(isValidEmail('@nodomain.com')).toBe(false);
      expect(isValidEmail('no domain@test.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
    });

    it('should handle emails with whitespace', () => {
      expect(isValidEmail('  user@example.com  ')).toBe(true);
    });
  });

  describe('validatePassword', () => {
    it('should return valid for passwords with 6+ characters', () => {
      const result = validatePassword('password123');
      expect(result.isValid).toBe(true);
      expect(result.message).toBe('');
    });

    it('should return invalid for short passwords', () => {
      const result = validatePassword('12345');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('6 characters');
    });

    it('should return invalid for empty passwords', () => {
      const result = validatePassword('');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should return invalid for null/undefined passwords', () => {
      expect(validatePassword(null).isValid).toBe(false);
      expect(validatePassword(undefined).isValid).toBe(false);
    });

    it('should accept exactly 6 characters', () => {
      const result = validatePassword('123456');
      expect(result.isValid).toBe(true);
    });
  });
});
