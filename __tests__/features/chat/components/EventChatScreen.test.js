// Description: Screen-level tests for EventChatScreen component
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

describe('EventChatScreen', () => {
  describe('module structure', () => {
    it('exports a default React component', () => {
      const EventChatScreenModule = require('../../../../src/features/chat/components/EventChatScreen');
      expect(EventChatScreenModule.default).toBeDefined();
      expect(typeof EventChatScreenModule.default).toBe('function');
    });
  });

  describe('related hooks', () => {
    it('useEventChatData hook is available', () => {
      const hook = require('../../../../src/features/chat/hooks/useEventChatData');
      expect(hook.useEventChatData).toBeDefined();
    });
  });

  describe('related stores', () => {
    it('userStore exports useUserStore hook', () => {
      const store = require('../../../../src/features/profile/stores/userStore');
      expect(store.useUserStore).toBeDefined();
    });
  });

  describe('related components', () => {
    it('EventChatHeader is available', () => {
      const component = require('../../../../src/features/chat/components/EventChatHeader');
      expect(component.default).toBeDefined();
    });

    it('MessageList is available', () => {
      const component = require('../../../../src/features/chat/components/MessageList');
      expect(component.default).toBeDefined();
    });

    it('ChatComposer is available', () => {
      const component = require('../../../../src/features/chat/components/ChatComposer');
      expect(component.default).toBeDefined();
    });
  });
});
