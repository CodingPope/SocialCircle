// Description: Screen-level tests for ProfileScreen component
// Note: Full rendering tests require complex mocking due to heavy native deps
// These tests verify module structure and related functionality

// Mock native modules that cause issues during require
jest.mock('react-native-image-crop-picker', () => ({
  openPicker: jest.fn(),
  openCamera: jest.fn(),
}));

jest.mock('expo-video', () => ({
  Video: 'Video',
  useVideoPlayer: jest.fn(),
}));

describe('ProfileScreen', () => {
  describe('module structure', () => {
    it('exports a default React component', () => {
      const ProfileScreenModule = require('../../../../src/features/events/components/ProfileScreen');
      expect(ProfileScreenModule.default).toBeDefined();
      expect(typeof ProfileScreenModule.default).toBe('function');
    });
  });

  describe('related stores', () => {
    it('userStore exports useUserStore hook', () => {
      const store = require('../../../../src/features/profile/stores/userStore');
      expect(store.useUserStore).toBeDefined();
    });

    it('userSnippetStore exports useUserSnippetStore hook', () => {
      const store = require('../../../../src/features/profile/stores/userSnippetStore');
      expect(store.useUserSnippetStore).toBeDefined();
    });
  });

  describe('related components', () => {
    it('ProfileHeader is available', () => {
      const component = require('../../../../src/features/profile/components/ProfileHeader');
      expect(component.default).toBeDefined();
    });

    it('ProfileHeaderInfo is available', () => {
      const component = require('../../../../src/features/profile/components/ProfileHeaderInfo');
      expect(component.default).toBeDefined();
    });
  });
});
