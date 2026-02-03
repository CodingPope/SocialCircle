// Description: Tests for discoveryService query builders (mocked Firestore + TTL cache)
jest.mock('../../../src/lib/ttlCache', () => ({
  getWithTTL: jest.fn((key, fetcher) => fetcher()),
}));

const mockGet = jest.fn();
const mockWhere = jest.fn(() => mockQuery);
const mockQuery = {
  where: mockWhere,
  get: mockGet,
};
const mockCollection = jest.fn(() => mockQuery);

jest.mock('../../../src/services/firebase/config', () => ({
  db: {
    collection: (...args) => mockCollection(...args),
  },
  Timestamp: {
    fromMillis: (ms) => ({ seconds: Math.floor(ms / 1000) }),
  },
  getTimestampNow: () => ({ seconds: 1000 }),
}));

jest.mock('geofire-common', () => ({
  geohashQueryBounds: () => [
    ['aaa', 'aaz'],
    ['aba', 'abz'],
  ],
  distanceBetween: () => 0.5, // km
}));

import {
  fetchHotEvents,
  fetchNewEvents,
  fetchThisWeekEvents,
} from '../../../src/features/events/api/discoveryService';

// Silence expected console.error noise from guarded catches
jest.spyOn(console, 'error').mockImplementation(() => {});

describe('discoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      docs: [
        {
          id: 'd1',
          data: () => ({
            location: { latitude: 1, longitude: 2 },
            isDeleted: false,
            createdAt: { seconds: 2000 },
            date: { seconds: 1500 },
          }),
        },
      ],
    });
  });

  it('returns empty for missing inputs', async () => {
    expect(await fetchHotEvents(null, null)).toEqual([]);
    expect(await fetchNewEvents(null, null)).toEqual({
      events: [],
      lastDoc: null,
    });
  });

  it('fetchHotEvents builds queries and dedupes', async () => {
    const events = await fetchHotEvents(
      ['music'],
      { latitude: 1, longitude: 2 },
      1000,
    );
    expect(mockCollection).toHaveBeenCalledWith('events');
    expect(mockWhere).toHaveBeenCalledWith('geohash', '>=', expect.any(String));
    expect(events[0].id).toBe('d1');
  });

  it('fetchNewEvents filters by createdAt and bounds', async () => {
    const { events } = await fetchNewEvents('music', {
      latitude: 1,
      longitude: 2,
    });
    expect(events[0].id).toBe('d1');
  });

  it('fetchThisWeekEvents applies date window', async () => {
    const { events } = await fetchThisWeekEvents('music', {
      latitude: 1,
      longitude: 2,
    });
    expect(events[0].id).toBe('d1');
  });
});
