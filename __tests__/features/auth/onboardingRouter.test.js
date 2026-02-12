// Description: Tests for onboarding step routing logic
import { getNextOnboardingStep } from '../../../src/features/auth/utils/onboardingRouter';

describe('getNextOnboardingStep', () => {
  it('routes to NameDob when name or dob missing', () => {
    expect(getNextOnboardingStep({})).toBe('NameDob');
    expect(getNextOnboardingStep({ firstName: 'A', lastName: 'B' })).toBe(
      'NameDob',
    );
  });

  it('routes to Sex when sex missing', () => {
    const user = { firstName: 'A', lastName: 'B', dob: '2000-01-01' };
    expect(getNextOnboardingStep(user)).toBe('Sex');
  });

  it('routes to TOS when not prompted', () => {
    const user = {
      firstName: 'A',
      lastName: 'B',
      dob: '2000-01-01',
      sex: 'male',
    };
    expect(getNextOnboardingStep(user)).toBe('TOS');
  });

  it('routes to Interests when none selected', () => {
    const user = {
      firstName: 'A',
      lastName: 'B',
      dob: '2000-01-01',
      sex: 'male',
      tosPromptedAt: Date.now(),
    };
    expect(getNextOnboardingStep(user)).toBe('InterestsScreen');
  });

  // Description: Location step removed from onboarding (SC-103) — now requested contextually on Map
  it('returns null when interests set (location no longer in onboarding)', () => {
    const user = {
      firstName: 'A',
      lastName: 'B',
      dob: '2000-01-01',
      sex: 'male',
      tosPromptedAt: Date.now(),
      interests: ['sports'],
    };
    expect(getNextOnboardingStep(user)).toBeNull();
  });

  it('returns null when all onboarding steps complete', () => {
    const user = {
      firstName: 'A',
      lastName: 'B',
      dob: '2000-01-01',
      sex: 'male',
      tosPromptedAt: Date.now(),
      interests: ['sports'],
      locationPromptedAt: Date.now(),
    };
    expect(getNextOnboardingStep(user)).toBeNull();
  });
});
