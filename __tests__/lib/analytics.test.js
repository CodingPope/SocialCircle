// Description: Tests for analytics helper pipeline (schema validation and track wrapper)
jest.mock('../../src/services/firebase/config', () => ({
  functions: {
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
  },
  auth: jest.fn(() => ({
    currentUser: { uid: 'u1' },
  })),
}));

const mockAnalyticsEvent = jest.fn();
const mockIsEnabled = jest.fn(() => true);

jest.mock('../../src/services/analyticsService', () => ({
  event: (...args) => mockAnalyticsEvent(...args),
  isEnabled: () => mockIsEnabled(),
}));

const mockWarn = jest.fn();
jest.mock('../../src/lib/logger', () => ({
  warn: (...args) => mockWarn(...args),
}));

import {
  AnalyticsEvents,
  trackCardImpression,
  trackShareEvent,
  trackOnboardingDone,
} from '../../src/lib/analytics';

describe('analytics helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEnabled.mockReturnValue(true);
  });

  describe('track helpers', () => {
    it('tracks card impression when payload valid', async () => {
      await trackCardImpression({ card_type: 'event', card_id: '1' });
      expect(mockAnalyticsEvent).toHaveBeenCalledWith(
        AnalyticsEvents.CARD_IMPRESSION,
        { card_type: 'event', card_id: '1' }
      );
    });

    it('swallows invalid payload', async () => {
      await trackCardImpression({}); // missing required
      expect(mockAnalyticsEvent).not.toHaveBeenCalled();
    });

    it('trackShareEvent enforces required channel', async () => {
      await trackShareEvent({ event_id: 'e1', channel: 'copy' });
      expect(mockAnalyticsEvent).toHaveBeenCalledWith(
        AnalyticsEvents.SHARE_EVENT,
        { event_id: 'e1', channel: 'copy' }
      );
    });

    it('trackOnboardingDone works when enabled', async () => {
      await trackOnboardingDone({ total_duration_ms: 1234 });
      expect(mockAnalyticsEvent).toHaveBeenCalledWith(
        AnalyticsEvents.ONBOARDING_DONE,
        { total_duration_ms: 1234 }
      );
    });

    it('no-ops when analytics disabled', async () => {
      mockIsEnabled.mockReturnValue(false);
      await trackCardImpression({ card_type: 'event', card_id: '1' });
      expect(mockAnalyticsEvent).not.toHaveBeenCalled();
    });
  });
});
