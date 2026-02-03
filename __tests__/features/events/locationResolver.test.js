// Description: Tests for location resolver helper (permission gating)
import {
  resolveLocationWithFallback,
  ensureForegroundPermission,
} from '../../../src/features/events/utils/locationResolver';
import {
  useDiscoveryLocationStore,
  DEFAULT_DISCOVERY_RADIUS_METERS,
} from '../../../src/features/events/stores/discoveryLocationStore';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

const Location = require('expo-location');

describe('locationResolver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Location.hasServicesEnabledAsync = jest.fn(() => Promise.resolve(true));
    useDiscoveryLocationStore.setState({
      gpsLocation: null,
      gpsLabel: null,
      gpsRadiusMeters: DEFAULT_DISCOVERY_RADIUS_METERS,
      lastGpsUpdate: 0,
      override: null,
    });
  });

  describe('ensureForegroundPermission', () => {
    it('returns true when granted', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
      });
      await expect(ensureForegroundPermission()).resolves.toBe(true);
    });

    it('returns false when denied', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
      });
      await expect(ensureForegroundPermission()).resolves.toBe(false);
    });
  });

  describe('resolveLocationWithFallback', () => {
    const fallback = { latitude: 0, longitude: 0 };

    it('returns current position when permission granted', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'granted',
      });
      Location.getCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 1, longitude: 2 },
      });
      const pos = await resolveLocationWithFallback(fallback);
      expect(pos).toEqual({ coords: { latitude: 1, longitude: 2 }, source: 'gps' });
    });

    it('returns fallback when permission denied', async () => {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({
        status: 'denied',
      });
      Location.getCurrentPositionAsync.mockRejectedValueOnce(
        new Error('permission denied'),
      );
      Location.getLastKnownPositionAsync = jest
        .fn()
        .mockResolvedValue(null);
      const pos = await resolveLocationWithFallback({ canUseDevice: true });
      expect(pos.coords).toBeNull();
      expect(pos.source).toBeNull();
    });

    it('returns fallback on errors', async () => {
      Location.requestForegroundPermissionsAsync.mockRejectedValue(
        new Error('boom'),
      );
      Location.getCurrentPositionAsync.mockRejectedValueOnce(
        new Error('boom'),
      );
      Location.getLastKnownPositionAsync = jest
        .fn()
        .mockResolvedValue(null);
      const pos = await resolveLocationWithFallback({ canUseDevice: true });
      expect(pos.coords).toBeNull();
      expect(pos.source).toBeNull();
    });
  });
});
