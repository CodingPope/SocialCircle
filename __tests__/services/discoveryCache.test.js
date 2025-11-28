jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/lib/ttlCache', () => ({
  getWithTTL: jest.fn(async (_key, fetcher, _ttl) => await fetcher()),
}));

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

import { getWithTTL } from '../../src/lib/ttlCache';
import { fetchHotEvents } from '../../src/services/discoveryQueries';

describe('discovery TTL cache layer', () => {
  it('wraps hot fetch in getWithTTL', async () => {
    const res = await fetchHotEvents(
      ['Music'],
      { latitude: 0, longitude: 0 },
      1000
    );
    expect(Array.isArray(res)).toBe(true);
    expect(getWithTTL).toHaveBeenCalled();
  });
});
