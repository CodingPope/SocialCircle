// Description: Tests for userSnippetStore caching and fetching
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const mockWhere = jest.fn(() => mockQuery);
const mockGet = jest.fn();
const mockDocGet = jest.fn();
const mockCollection = jest.fn(() => mockQuery);
const mockDoc = jest.fn(() => ({ get: mockDocGet }));

const mockQuery = {
  where: mockWhere,
  get: mockGet,
};

jest.mock('../../../src/services/firebase/config', () => ({
  db: {
    collection: (...args) => mockCollection(...args),
    doc: (...args) => mockDoc(...args),
  },
}));

jest.mock('../../../src/lib/logger', () => ({
  debug: jest.fn(),
}));

import { useUserSnippetStore } from '../../../src/features/profile/stores/userSnippetStore';

describe('userSnippetStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUserSnippetStore.setState({
      ttlMs: 24 * 60 * 60 * 1000,
      cache: {},
      inflight: {},
    });
  });

  it('putMany caches snippets with TTL', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    useUserSnippetStore.getState().putMany([{ uid: 'u1', name: 'Name' }]);
    const entry = useUserSnippetStore.getState().cache['u1'];
    expect(entry.data.name).toBe('Name');
    expect(entry.expiresAt).toBe(now + useUserSnippetStore.getState().ttlMs);
    Date.now.mockRestore();
  });

  it('getMany returns fresh entries only', () => {
    const now = Date.now();
    useUserSnippetStore.setState({
      cache: {
        fresh: { data: { uid: 'fresh' }, expiresAt: now + 1000 },
        stale: { data: { uid: 'stale' }, expiresAt: now - 1000 },
      },
      ttlMs: 1000,
    });
    const res = useUserSnippetStore.getState().getMany(['fresh', 'stale']);
    expect(res.has('fresh')).toBe(true);
    expect(res.has('stale')).toBe(false);
  });

  it('ensureSnippets fetches missing via batched query and caches', async () => {
    mockGet.mockResolvedValueOnce({
      docs: [
        {
          id: 'u2',
          data: () => ({
            firstName: 'A',
            lastName: 'B',
            profileImage: 'p',
            verified: true,
            rating: 5,
          }),
        },
      ],
    });
    const map = await useUserSnippetStore
      .getState()
      .ensureSnippets(['u1', 'u2']);
    expect(mockCollection).toHaveBeenCalledWith('users');
    expect(mockWhere).toHaveBeenCalledWith('__name__', 'in', ['u1', 'u2']);
    expect(map.get('u2').name).toBe('A B');
    expect(useUserSnippetStore.getState().cache['u2'].data.uid).toBe('u2');
  });

  it('clearUser removes only specified user', () => {
    useUserSnippetStore.setState({
      cache: { a: { data: { uid: 'a' } }, b: { data: { uid: 'b' } } },
    });
    useUserSnippetStore.getState().clearUser('a');
    expect(useUserSnippetStore.getState().cache.a).toBeUndefined();
    expect(useUserSnippetStore.getState().cache.b).toBeDefined();
  });
});
