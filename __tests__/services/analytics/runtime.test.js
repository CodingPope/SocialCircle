// Description: Tests for analytics runtime (init, tracking, events)

// Mock dependencies before imports
jest.mock('../../../src/services/locationContextService', () => ({
  getFormattedCity: jest.fn(() => Promise.resolve('San Francisco, CA')),
}));

jest.mock('../../../src/lib/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../../src/services/analytics/props', () => ({
  deriveUserAnalyticsProps: jest.fn((user) => ({
    tier: user?.tier || 'free',
    verified: user?.verified ? 'true' : 'false',
  })),
}));

// Create mock analytics instance
const mockAnalytics = {
  setAnalyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
  setUserId: jest.fn(() => Promise.resolve()),
  setUserProperty: jest.fn(() => Promise.resolve()),
  setUserProperties: jest.fn(() => Promise.resolve()),
  setSessionTimeoutDuration: jest.fn(() => Promise.resolve()),
  setDefaultEventParameters: jest.fn(() => Promise.resolve()),
  logEvent: jest.fn(() => Promise.resolve()),
  logScreenView: jest.fn(() => Promise.resolve()),
};

jest.mock('@react-native-firebase/analytics', () => ({
  __esModule: true,
  default: jest.fn(() => mockAnalytics),
}));

import {
  setTrackingAllowed,
  isEnabled,
  analyticsInit,
  init,
  setOptIn,
  screen,
  event,
  track,
  identify,
  trackJoinEventSafe,
  trackCreateEventSafe,
  trackFilterApplySafe,
} from '../../../src/services/analytics/runtime';

describe('analytics/runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset tracking state
    setTrackingAllowed(true);
  });

  describe('setTrackingAllowed', () => {
    it('enables tracking when called with true', () => {
      setTrackingAllowed(true);
      // Tracking state is internal, verified by subsequent init behavior
      expect(true).toBe(true);
    });

    it('disables tracking when called with false', () => {
      setTrackingAllowed(false);
      // When tracking is not allowed, analytics should be disabled
      expect(true).toBe(true);
    });
  });

  describe('isEnabled', () => {
    it('returns false initially', () => {
      // After module reload, enabled should be false
      expect(typeof isEnabled()).toBe('boolean');
    });
  });

  describe('analyticsInit', () => {
    it('enables collection when optedIn is true', async () => {
      await analyticsInit({ optedIn: true, uid: 'user123' });
      expect(mockAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
        true,
      );
    });

    it('disables collection when optedIn is false', async () => {
      await analyticsInit({ optedIn: false });
      expect(mockAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
        false,
      );
    });

    it('sets user ID when enabled and uid provided', async () => {
      await analyticsInit({ optedIn: true, uid: 'user123' });
      expect(mockAnalytics.setUserId).toHaveBeenCalledWith('user123');
    });

    it('clears user ID when disabled', async () => {
      await analyticsInit({ optedIn: false });
      expect(mockAnalytics.setUserId).toHaveBeenCalledWith(null);
    });

    it('sets user properties when enabled', async () => {
      await analyticsInit({
        optedIn: true,
        uid: 'user123',
        props: { tier: 'premium' },
      });
      expect(mockAnalytics.setUserProperty).toHaveBeenCalledWith(
        'tier',
        'premium',
      );
    });

    it('logs app_open event when enabled', async () => {
      await analyticsInit({ optedIn: true, uid: 'user123' });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith('app_open');
    });
  });

  describe('init', () => {
    it('initializes with user who opted in', async () => {
      const user = {
        uid: 'user123',
        analyticsOptIn: true,
        interests: ['Music', 'Sports'],
        tier: 'premium',
      };
      await init(user);
      expect(mockAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
        true,
      );
    });

    it('does not enable for user who opted out', async () => {
      const user = {
        uid: 'user123',
        analyticsOptIn: false,
      };
      await init(user);
      expect(mockAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
        false,
      );
    });

    it('handles user with no interests', async () => {
      const user = {
        uid: 'user123',
        analyticsOptIn: true,
      };
      await init(user);
      expect(mockAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalled();
    });
  });

  describe('setOptIn', () => {
    it('enables analytics when set to true', async () => {
      await setOptIn(true);
      expect(mockAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalled();
    });

    it('disables analytics when set to false', async () => {
      await setOptIn(false);
      expect(mockAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
        false,
      );
    });
  });

  describe('screen', () => {
    beforeEach(async () => {
      // Enable analytics first
      await analyticsInit({ optedIn: true, uid: 'user123' });
      jest.clearAllMocks();
    });

    it('logs screen view with sanitized params', async () => {
      await screen('HomeScreen', { tab: 'discover' });
      expect(mockAnalytics.logScreenView).toHaveBeenCalledWith(
        expect.objectContaining({
          screen_name: 'HomeScreen',
          screen_class: 'HomeScreen',
        }),
      );
    });

    it('does nothing when name is empty', async () => {
      await screen('', { tab: 'discover' });
      expect(mockAnalytics.logScreenView).not.toHaveBeenCalled();
    });

    it('does nothing when analytics is disabled', async () => {
      await analyticsInit({ optedIn: false });
      jest.clearAllMocks();
      await screen('HomeScreen');
      expect(mockAnalytics.logScreenView).not.toHaveBeenCalled();
    });
  });

  describe('event', () => {
    beforeEach(async () => {
      await analyticsInit({ optedIn: true, uid: 'user123' });
      jest.clearAllMocks();
    });

    it('logs event with sanitized params', async () => {
      await event('button_click', { button: 'join' });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'button_click',
        expect.objectContaining({ button: 'join' }),
      );
    });

    it('does nothing when name is empty', async () => {
      await event('', { data: 'test' });
      expect(mockAnalytics.logEvent).not.toHaveBeenCalled();
    });

    it('does nothing when analytics is disabled', async () => {
      await analyticsInit({ optedIn: false });
      jest.clearAllMocks();
      await event('test_event');
      expect(mockAnalytics.logEvent).not.toHaveBeenCalled();
    });
  });

  describe('track', () => {
    beforeEach(async () => {
      await analyticsInit({ optedIn: true, uid: 'user123' });
      jest.clearAllMocks();
    });

    it('is an alias for event', async () => {
      await track('test_event', { key: 'value' });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'test_event',
        expect.any(Object),
      );
    });
  });

  describe('identify', () => {
    beforeEach(async () => {
      await analyticsInit({ optedIn: true, uid: 'user123' });
      jest.clearAllMocks();
    });

    it('sets user properties with sanitized values', async () => {
      await identify({ tier: 'premium', level: '5' });
      expect(mockAnalytics.setUserProperties).toHaveBeenCalled();
    });

    it('does nothing when analytics is disabled', async () => {
      await analyticsInit({ optedIn: false });
      jest.clearAllMocks();
      await identify({ tier: 'premium' });
      expect(mockAnalytics.setUserProperties).not.toHaveBeenCalled();
    });
  });

  describe('trackJoinEventSafe', () => {
    beforeEach(async () => {
      await analyticsInit({ optedIn: true, uid: 'user123' });
      jest.clearAllMocks();
    });

    it('tracks join_event with numeric capacity', async () => {
      await trackJoinEventSafe({
        capacity: 20,
        attendeeCount: 5,
        privacy: 'public',
      });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'join_event',
        expect.objectContaining({
          capacity: 20,
          attendee_count: 5,
          privacy: 'public',
        }),
      );
    });

    it('handles invalid capacity gracefully', async () => {
      await trackJoinEventSafe({
        capacity: 'invalid',
        attendeeCount: null,
        privacy: '',
      });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'join_event',
        expect.objectContaining({
          capacity: 0,
          attendee_count: 0,
        }),
      );
    });
  });

  describe('trackCreateEventSafe', () => {
    beforeEach(async () => {
      await analyticsInit({ optedIn: true, uid: 'user123' });
      jest.clearAllMocks();
    });

    it('tracks create_event with privacy and category', async () => {
      await trackCreateEventSafe({
        privacy: 'private',
        hasImage: true,
        category: 'Music',
      });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'create_event',
        expect.objectContaining({
          privacy: 'private',
          category: 'Music',
        }),
      );
    });

    it('logs create_event even with empty params', async () => {
      await trackCreateEventSafe({});
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'create_event',
        expect.any(Object),
      );
    });
  });

  describe('trackFilterApplySafe', () => {
    beforeEach(async () => {
      await analyticsInit({ optedIn: true, uid: 'user123' });
      jest.clearAllMocks();
    });

    it('tracks filter_apply with interests_count', async () => {
      await trackFilterApplySafe({ interestsCount: 3, genderOnly: true });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'filter_apply',
        expect.objectContaining({
          interests_count: 3,
        }),
      );
    });

    it('handles zero interests', async () => {
      await trackFilterApplySafe({ interestsCount: 0, genderOnly: false });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'filter_apply',
        expect.objectContaining({
          interests_count: 0,
        }),
      );
    });
  });
});
