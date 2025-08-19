import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getWithTTL,
  setWithTTL,
  getIfFresh,
  invalidate,
} from '../../src/lib/ttlCache';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('ttlCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns fresh hit', async () => {
    const now = Date.now();
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({ value: { a: 1 }, ts: now })
    );
    const v = await getIfFresh('k', 1000);
    expect(v).toEqual({ a: 1 });
  });

  it('misses when stale', async () => {
    const past = Date.now() - 5000;
    AsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({ value: 42, ts: past })
    );
    const v = await getIfFresh('k', 1000);
    expect(v).toBeNull();
  });

  it('handles invalid JSON', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce('not json');
    const v = await getIfFresh('k', 1000);
    expect(v).toBeNull();
  });

  it('getWithTTL caches fetch result', async () => {
    let calls = 0;
    const fetcher = async () => ({ x: ++calls });
    // miss => fetch
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    const v1 = await getWithTTL('k2', fetcher, 1000);
    expect(v1).toEqual({ x: 1 });
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });
});
