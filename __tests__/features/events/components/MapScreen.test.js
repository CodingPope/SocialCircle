// Description: Screen-level tests for MapScreen component
// Note: Full rendering tests require complex mocking due to react-native-maps
// These tests verify module structure and related modules without heavy native deps

// Mock native modules that cause issues during require
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  Marker: 'Marker',
  PROVIDER_GOOGLE: 'google',
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

jest.mock('react-native-image-crop-picker', () => ({
  openPicker: jest.fn(),
  openCamera: jest.fn(),
}));

jest.mock('expo-video', () => ({
  Video: 'Video',
  useVideoPlayer: jest.fn(),
}));

jest.mock('@ptomasroos/react-native-multi-slider', () => 'MultiSlider');

jest.mock(
  '@react-native-segmented-control/segmented-control',
  () => 'SegmentedControl',
);

describe('MapScreen', () => {
  describe('module structure', () => {
    it('exports a default React component', () => {
      // Verify the module structure without rendering (avoids native deps)
      const MapScreenModule = require('../../../../src/features/events/components/MapScreen');
      expect(MapScreenModule.default).toBeDefined();
      expect(typeof MapScreenModule.default).toBe('function');
    });
  });

  describe('related stores and hooks', () => {
    it('discoveryLocationStore exports required selectors and constants', () => {
      const store = require('../../../../src/features/events/stores/discoveryLocationStore');
      expect(store.useDiscoveryLocationStore).toBeDefined();
      expect(store.DEFAULT_DISCOVERY_RADIUS_METERS).toBeDefined();
      expect(store.MIN_DISCOVERY_RADIUS_METERS).toBeDefined();
      expect(store.MAX_DISCOVERY_RADIUS_METERS).toBeDefined();
    });

    it('useDiscoveryFeed hook is available', () => {
      const hook = require('../../../../src/features/events/hooks/useDiscoveryFeed');
      expect(hook.default).toBeDefined();
    });

    it('joinEventService is available', () => {
      const service = require('../../../../src/features/events/api/joinEventService');
      expect(service.default).toBeDefined();
    });
  });
});
