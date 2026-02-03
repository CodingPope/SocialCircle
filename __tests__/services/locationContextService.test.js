// Description: Tests for coarse location context service
jest.mock('expo-location', () => ({
  Accuracy: { High: 3, Balanced: 2 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

import * as Location from 'expo-location';
import {
  getCoarseLocation,
  clearLocationCache,
  refreshLocation,
  getFormattedCity,
} from '../../src/services/locationContextService';

describe('locationContextService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearLocationCache();
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.hasServicesEnabledAsync.mockResolvedValue(true);
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 10, longitude: 20, accuracy: 4000 },
    });
    Location.reverseGeocodeAsync.mockResolvedValue([
      { city: 'Seattle', region: 'WA', country: 'USA' },
    ]);
  });

  it('returns cached location when fresh', async () => {
    const first = await getCoarseLocation();
    const second = await getCoarseLocation();
    expect(first).toEqual(second);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('returns null when services disabled', async () => {
    Location.hasServicesEnabledAsync.mockResolvedValue(false);
    const res = await getCoarseLocation({ force: true });
    expect(res).toBeNull();
  });

  it('returns null when permission denied', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });
    const res = await getCoarseLocation({ force: true });
    expect(res).toBeNull();
  });

  it('filters simulator defaults when forced', async () => {
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 37.3346, longitude: -122.009, accuracy: 1 },
    });
    const res = await refreshLocation();
    expect(res).toBeNull();
  });

  it('formats city string', async () => {
    const city = await getFormattedCity();
    expect(city).toBe('Seattle, WA');
  });
});
