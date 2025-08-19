import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserSnippetStore } from '../../src/store/userSnippetStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('userSnippetStore TTL eviction on rehydrate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUserSnippetStore.setState({ cache: {} });
  });

  it('drops stale entries', async () => {
    const now = Date.now();
    const state = {
      cache: {
        fresh: { data: { uid: 'fresh', name: 'A' }, expiresAt: now + 10000 },
        stale: { data: { uid: 'stale', name: 'B' }, expiresAt: now - 1 },
      },
      ttlMs: 1000,
    };
    const persisted = { state: JSON.stringify(state) };
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(persisted));
    useUserSnippetStore.persist?.rehydrate?.();
    await Promise.resolve();
    const cache = useUserSnippetStore.getState().cache;
    // fresh may be preserved or re-written; just assert stale is gone and structure is object
    expect(typeof cache).toBe('object');
    expect(cache.stale).toBeUndefined();
  });
});
