jest.mock('sentry-expo', () => ({
  init: jest.fn(),
  Native: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  },
}));

import * as Sentry from 'sentry-expo';
import { initErrorReporting, captureError } from '../../src/lib/errorReporting';

describe('errorReporting', () => {
  it('no-op when no DSN', () => {
    expect(() => initErrorReporting({ dsn: '' })).not.toThrow();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('captures errors when initialized', () => {
    initErrorReporting({ dsn: 'https://dsn' });
    const err = new Error('boom');
    expect(() => captureError(err)).not.toThrow();
  });
});
