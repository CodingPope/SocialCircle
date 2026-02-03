// Description: Tests for deepLinkingService helpers
jest.mock('expo-constants', () => ({
  appOwnership: 'standalone',
  expoConfig: {
    extra: {
      share: {
        domain: 'go.socialcircle.app',
        previewBaseUrl: '',
      },
      firebaseProjectId: 'proj123',
    },
  },
}));

jest.mock('../../src/navigation/RootNavigation', () => {
  const mockNavigate = jest.fn();
  return {
    navigate: mockNavigate,
  };
});

import {
  getUniversalLinkSettings,
  shouldEnableDeepLinking,
  parseShareLink,
  handleIncomingLink,
  buildEventLinkPath,
} from '../../src/services/deepLinkingService';
import { navigate } from '../../src/navigation/RootNavigation';

describe('deepLinkingService', () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it('returns universal link settings with fallback preview', () => {
    const settings = getUniversalLinkSettings();
    expect(settings.domain).toBe('go.socialcircle.app');
    expect(settings.previewBaseUrl).toContain('cloudfunctions.net/sharePreview');
  });

  it('enables deep linking outside Expo Go', () => {
    expect(shouldEnableDeepLinking()).toBe(true);
  });

  it('parses event and post links', () => {
    expect(parseShareLink('https://go.socialcircle.app/e/123')).toEqual({
      type: 'event',
      id: '123',
    });
    expect(parseShareLink('https://go.socialcircle.app/post/abc')).toEqual({
      type: 'post',
      id: 'abc',
    });
  });

  it('handles incoming event link by navigating to Map', () => {
    const handled = handleIncomingLink('https://go.socialcircle.app/e/42');
    expect(handled).toBe(true);
    expect(navigate).toHaveBeenCalledWith('MainTabs', {
      screen: 'Map',
      params: { initialEventId: '42' },
    });
  });

  it('builds event link path', () => {
    const url = buildEventLinkPath('777');
    expect(url).toBe('https://go.socialcircle.app/e/777');
  });
});
