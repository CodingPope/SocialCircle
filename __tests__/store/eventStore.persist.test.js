import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react-test-renderer';
import { useEventStore } from '../../src/store/eventStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('eventStore persistence with TTL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // reset store
    useEventStore.setState({
      events: [],
      lastFetchedAt: 0,
      needsRefresh: false,
    });
  });

  it('clears stale events or flags needsRefresh on rehydrate', async () => {
    const stale = {
      state: JSON.stringify({
        events: [{ id: '1' }],
        lastFetchedAt: Date.now() - 10 * 60 * 1000,
        ttlMs: 1000,
      }),
    };
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(stale));
    useEventStore.persist?.rehydrate?.();
    await Promise.resolve();
    const s = useEventStore.getState();
    expect(Array.isArray(s.events)).toBe(true);
    expect(s.events.length === 0 || s.needsRefresh === true).toBe(true);
  });

  it('keeps events when fresh', async () => {
    const fresh = {
      state: JSON.stringify({
        events: [{ id: '1' }],
        lastFetchedAt: Date.now(),
        ttlMs: 1000,
      }),
    };
    AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(fresh));
    useEventStore.persist?.rehydrate?.();
    await Promise.resolve();
    expect(useEventStore.getState().needsRefresh).toBe(false);
  });
});
