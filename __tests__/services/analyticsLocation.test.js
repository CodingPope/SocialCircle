// Description: Smoke test for analytics + location integration
import {
  getFormattedCity,
  clearLocationCache,
  refreshLocation,
} from '../../src/services/locationContextService';
import { deriveUserAnalyticsProps } from '../../src/services/analyticsService';

// Mock expo-location to avoid native module dependency in Jest
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' })
  ),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 2500,
      },
    })
  ),
  reverseGeocodeAsync: jest.fn(() =>
    Promise.resolve([
      {
        city: 'San Francisco',
        region: 'CA',
        country: 'United States',
        isoCountryCode: 'US',
      },
    ])
  ),
  Accuracy: {
    Low: 4,
    Balanced: 3,
    High: 2,
    BestForNavigation: 1,
  },
}));

describe('Analytics + Location Integration', () => {
  beforeEach(() => {
    clearLocationCache();
  });

  it('derives user analytics props with location', () => {
    const user = {
      uid: 'test123',
      dob: new Date('1995-06-15'),
      sex: 'female',
      plan: 'premium',
      interests: ['Hiking', 'Photography'],
      city: 'Austin',
      pushOptIn: true,
    };

    const props = deriveUserAnalyticsProps(user);

    expect(props).toMatchObject({
      plan: 'premium',
      interests_count: '2',
      age_bracket: '25_34',
      sex: 'female',
      home_city: 'Austin',
      push_opt_in: 'true',
    });
  });

  it('gets formatted city from location service', async () => {
    const city = await getFormattedCity();
    expect(city).toBe('San Francisco, CA');
  });

  it('caches location to avoid excessive API calls', async () => {
    const Location = require('expo-location');

    // Clear and reset mock counters
    clearLocationCache();
    Location.getCurrentPositionAsync.mockClear();
    Location.reverseGeocodeAsync.mockClear();

    // First call
    const city1 = await getFormattedCity();
    expect(city1).toBe('San Francisco, CA');
    const firstCallCount = Location.getCurrentPositionAsync.mock.calls.length;
    expect(firstCallCount).toBeGreaterThanOrEqual(1);

    // Second call (should use cache)
    const city2 = await getFormattedCity();
    expect(city2).toBe('San Francisco, CA');
    const secondCallCount = Location.getCurrentPositionAsync.mock.calls.length;
    expect(secondCallCount).toBe(firstCallCount); // No additional calls
  });

  it('handles missing location gracefully', async () => {
    const Location = require('expo-location');
    Location.getForegroundPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
    });

    clearLocationCache();
    const city = await getFormattedCity();
    expect(city).toBeNull();
  });

  it('force refresh skips simulator default coordinates', async () => {
    const Location = require('expo-location');
    clearLocationCache();

    // Ensure next call uses simulator default coords
    Location.getCurrentPositionAsync.mockResolvedValueOnce({
      coords: {
        latitude: 37.3346,
        longitude: -122.009,
        accuracy: 1200,
      },
    });

    const result = await refreshLocation();
    expect(result).toBeNull();
  });

  it('escalates accuracy when radius is too large', async () => {
    const Location = require('expo-location');
    clearLocationCache();

    Location.getCurrentPositionAsync.mockClear();
    Location.reverseGeocodeAsync.mockClear();

    Location.getCurrentPositionAsync.mockImplementationOnce(() =>
      Promise.resolve({
        coords: {
          latitude: 39.7392,
          longitude: -104.9903,
          accuracy: 12000,
        },
      })
    );

    Location.getCurrentPositionAsync.mockImplementationOnce(() =>
      Promise.resolve({
        coords: {
          latitude: 39.7392,
          longitude: -104.9903,
          accuracy: 1800,
        },
      })
    );

    Location.reverseGeocodeAsync.mockResolvedValueOnce([
      {
        city: 'Denver',
        region: 'CO',
        country: 'United States',
        isoCountryCode: 'US',
      },
    ]);

    const result = await refreshLocation();
    expect(result).toMatchObject({
      city: 'Denver',
      region: 'CO',
    });

    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
    expect(Location.getCurrentPositionAsync.mock.calls[0][0]).toMatchObject({
      accuracy: Location.Accuracy.High,
    });
    expect(Location.getCurrentPositionAsync.mock.calls[1][0]).toMatchObject({
      accuracy: Location.Accuracy.BestForNavigation,
    });
  });
});
