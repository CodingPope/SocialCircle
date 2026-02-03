// Additional coverage for authErrorHandler branches
import { getAuthErrorMessage } from '../../../src/features/auth/utils/authErrorHandler';

describe('authErrorHandler extra branches', () => {
  it('handles popup-blocked', () => {
    const res = getAuthErrorMessage({ code: 'auth/popup-blocked' }, 'signup');
    expect(res.title).toBe('Popup Blocked');
  });

  it('handles missing email/password', () => {
    expect(getAuthErrorMessage({ code: 'auth/missing-email' }).title).toBe(
      'Email Required'
    );
    expect(
      getAuthErrorMessage({ code: 'auth/missing-password' }, 'login').title
    ).toBe('Password Required');
  });

  it('handles configuration error', () => {
    const res = getAuthErrorMessage(
      { code: 'auth/invalid-api-key' },
      'signup'
    );
    expect(res.title).toBe('Configuration Error');
  });

  it('handles invalid credential outside login', () => {
    const res = getAuthErrorMessage(
      { code: 'auth/invalid-credential' },
      'reset'
    );
    expect(res.title).toBe('Login Failed');
  });
});
