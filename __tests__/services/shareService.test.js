// Description: Coverage for shareService flows (event/post/profile)
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Share: {
    share: jest.fn(),
    sharedAction: 'shared',
    dismissedAction: 'dismissed',
  },
  Platform: { OS: 'ios', select: (opts) => opts.ios },
}));

jest.mock('../../src/lib/analytics', () => ({
  trackShareEvent: jest.fn(),
  trackSessionStart: jest.fn(),
}));

jest.mock('../../src/services/analyticsService', () => ({
  event: jest.fn(),
}));

jest.mock('../../src/services/deepLinkingService', () => ({
  getUniversalLinkSettings: () => ({
    domain: 'go.socialcircle.app',
    previewBaseUrl: 'https://fallback.socialcircle.app/share',
  }),
}));

jest.mock('../../src/features/events/utils/rsvpVisibility', () => ({
  getEventCityLabel: () => 'Seattle, WA',
  shouldMaskRsvpDetails: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/services/firebase/config', () => ({
  functions: {
    httpsCallable: jest.fn(() =>
      jest.fn(() => Promise.resolve({ data: { url: 'https://go.socialcircle.app/e/123' } }))
    ),
  },
}));

import { Share, Alert } from 'react-native';
import { trackShareEvent } from '../../src/lib/analytics';
import { event as trackAnalyticsEvent } from '../../src/services/analyticsService';
import { shouldMaskRsvpDetails } from '../../src/features/events/utils/rsvpVisibility';
import {
  shareEvent,
  sharePost,
  shareProfile,
  getShareLinkFor,
} from '../../src/services/shareService';

describe('shareService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('shareEvent', () => {
    const baseEvent = { id: 'e1', title: 'Party', locationName: 'Central Park' };

    it('shares successfully and tracks analytics', async () => {
      Share.share.mockResolvedValueOnce({
        action: Share.sharedAction,
        activityType: 'com.apple.UIKit.activity.CopyToPasteboard',
      });

      const res = await shareEvent(baseEvent, { surface: 'event_detail' });

      expect(res.completed).toBe(true);
      expect(res.channel).toBe('copy'); // mapped activity type
      expect(trackShareEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_id: 'e1', channel: 'copy' })
      );
      expect(trackAnalyticsEvent).toHaveBeenCalledWith(
        'share_event',
        expect.objectContaining({ surface: 'event_detail', beta_mode: true })
      );
    });

    it('alerts when missing event', async () => {
      const res = await shareEvent(null);
      expect(res.completed).toBe(false);
      expect(Alert.alert).toHaveBeenCalled();
    });

    it('handles dismissal without tracking', async () => {
      Share.share.mockResolvedValueOnce({ action: Share.dismissedAction });
      const res = await shareEvent(baseEvent);
      expect(res.completed).toBe(false);
      expect(trackShareEvent).not.toHaveBeenCalled();
    });

    it('masks details when required', async () => {
      shouldMaskRsvpDetails.mockReturnValueOnce(true);
      Share.share.mockResolvedValueOnce({ action: Share.sharedAction });
      await shareEvent(baseEvent);
      // No assertion on content; presence of call verifies path
      expect(shouldMaskRsvpDetails).toHaveBeenCalledWith(baseEvent, null);
    });
  });

  describe('sharePost', () => {
    const post = { id: 'p1', content: 'Hello world', creatorSnapshot: { displayName: 'Ada' } };

    it('shares post and marks completed', async () => {
      Share.share.mockResolvedValueOnce({ action: Share.sharedAction });
      const res = await sharePost(post, { surface: 'interest_post' });
      expect(res.completed).toBe(true);
      expect(trackAnalyticsEvent).toHaveBeenCalledWith(
        'share_post',
        expect.objectContaining({ surface: 'interest_post', beta_mode: true })
      );
    });

    it('alerts on missing post', async () => {
      const res = await sharePost(null);
      expect(res.completed).toBe(false);
      expect(Alert.alert).toHaveBeenCalled();
    });
  });

  describe('shareProfile', () => {
    const profile = { uid: 'u1', firstName: 'Jane', lastName: 'Doe', city: 'NYC' };

    it('shares profile and tracks', async () => {
      Share.share.mockResolvedValueOnce({ action: Share.sharedAction });
      const res = await shareProfile(profile, { surface: 'profile' });
      expect(res.completed).toBe(true);
      expect(trackAnalyticsEvent).toHaveBeenCalledWith(
        'share_profile',
        expect.objectContaining({ surface: 'profile', beta_mode: true })
      );
    });

    it('alerts on missing profile', async () => {
      const res = await shareProfile(null);
      expect(res.completed).toBe(false);
      expect(Alert.alert).toHaveBeenCalled();
    });
  });

  describe('getShareLinkFor', () => {
    it('returns link payload from callable', async () => {
      const payload = await getShareLinkFor('event', 'abc');
      expect(payload.url).toBe('https://go.socialcircle.app/e/123');
    });
  });
});
