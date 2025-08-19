jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/lib/ttlCache', () => ({
  getWithTTL: jest.fn(async (_key, fetcher, _ttl) => await fetcher()),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn(),
  getDocs: jest.fn(async () => ({ docs: [] })),
  query: jest.fn(),
  where: jest.fn(),
  Timestamp: {
    now: () => ({ seconds: Math.floor(Date.now() / 1000) }),
    fromMillis: (ms) => ({ seconds: Math.floor(ms / 1000) }),
  },
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
