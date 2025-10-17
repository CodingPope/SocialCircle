jest.mock('@react-native-firebase/analytics', () => {
  const mockAnalytics = {
    setAnalyticsCollectionEnabled: jest.fn(),
    setSessionTimeoutDuration: jest.fn(),
    setUserId: jest.fn(),
    setUserProperty: jest.fn(),
    logEvent: jest.fn(),
  };
  const factory = jest.fn(() => mockAnalytics);
  factory.mockAnalytics = mockAnalytics;
  return { default: factory };
});

jest.mock('@react-native-firebase/app', () => ({}), { virtual: true });

import { deriveUserAnalyticsProps } from '../../src/services/analytics';

describe('deriveUserAnalyticsProps', () => {
  it('generates normalized properties with age and sex buckets', () => {
    const now = new Date();
    const twentySixYearsAgo = new Date(
      now.getFullYear() - 26,
      now.getMonth(),
      now.getDate()
    );

    const props = deriveUserAnalyticsProps({
      plan: 'Premium',
      interests: new Array(12).fill('foo'),
      dob: { toDate: () => twentySixYearsAgo },
      sex: 'Woman',
      city: 'San Francisco',
      pushOptIn: true,
    });

    expect(props.plan).toBe('premium');
    expect(props.interests_count).toBe('12');
    expect(props.age_bracket).toBe('25_34');
    expect(props.sex).toBe('female');
    expect(props.home_city).toBe('San Francisco');
    expect(props.push_opt_in).toBe('true');
  });

  it('falls back to defaults when data is missing', () => {
    const props = deriveUserAnalyticsProps({});
    expect(props.plan).toBe('free');
    expect(props.interests_count).toBe('0');
    expect(props.sex).toBe('unknown');
    expect(props.push_opt_in).toBe('false');
  });
});
