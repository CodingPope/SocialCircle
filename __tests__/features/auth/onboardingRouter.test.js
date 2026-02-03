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

  it('routes to Location when interests set but location not prompted', () => {
    const user = {
      firstName: 'A',
      lastName: 'B',
      dob: '2000-01-01',
      sex: 'male',
      tosPromptedAt: Date.now(),
      interests: ['sports'],
    };
    expect(getNextOnboardingStep(user)).toBe('Location');
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
