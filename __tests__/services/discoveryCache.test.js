// Mock AsyncStorage first
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock ttlCache module - must use factory function that returns the mock
jest.mock('../../src/lib/ttlCache', () => {
  const mockGetWithTTL = jest.fn(
    async (_key, fetcher, _ttl) => await fetcher(),
  );
  return {
    getWithTTL: mockGetWithTTL,
    __mockGetWithTTL: mockGetWithTTL, // expose for assertions
  };
});

jest.mock('../../src/services/firebase/config', () => {
  const createQuery = () => {
    const query = {
      where: jest.fn(() => query),
      get: jest.fn(async () => ({ docs: [] })),
    };
    return query;
  };
  return {
    db: { collection: jest.fn(() => createQuery()) },
    Timestamp: {
      fromMillis: (ms) => ({ seconds: Math.floor(ms / 1000) }),
    },
    getTimestampNow: () => ({ seconds: Math.floor(Date.now() / 1000) }),
  };
});

jest.mock('geofire-common', () => ({
  geohashQueryBounds: jest.fn(() => [['aaaa', 'zzzz']]),
  distanceBetween: jest.fn(() => 0),
}));

import { fetchHotEvents } from '../../src/services/discoveryQueries';
import { __mockGetWithTTL as mockGetWithTTL } from '../../src/lib/ttlCache';

describe('discovery TTL cache layer', () => {
  beforeEach(() => {
    mockGetWithTTL.mockClear();
  });

  it('wraps hot fetch in getWithTTL', async () => {
    const res = await fetchHotEvents(
      ['Music'],
      { latitude: 0, longitude: 0 },
      1000,
    );
    expect(Array.isArray(res)).toBe(true);
    expect(mockGetWithTTL).toHaveBeenCalled();
  });
});
