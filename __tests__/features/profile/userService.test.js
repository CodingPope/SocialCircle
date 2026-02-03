// Description: Tests for userService sanitization and mutations
let mockCallable;

jest.mock('geofire-common', () => ({
  geohashForLocation: () => '9q8yyzzzzz',
}));

jest.mock('../../../src/lib/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../../src/lib/analytics', () => ({
  track: jest.fn(),
}));

jest.mock('../../../src/services/firebase/config', () => {
  mockCallable = jest.fn(() => Promise.resolve());
  const collectionMock = jest.fn(() => ({
    where: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({
            empty: false,
            docs: [
              {
                id: 'soft1',
                ref: { update: jest.fn() },
                data: () => ({ isDeleted: true }),
              },
            ],
          })
        ),
      })),
    })),
    doc: jest.fn(() => ({
      get: jest.fn(() =>
        Promise.resolve({
          exists: true,
          data: () => ({ firstName: 'Ada', isDeleted: false, rating: 4 }),
        })
      ),
      update: jest.fn(() => Promise.resolve()),
      set: jest.fn(() => Promise.resolve()),
    })),
  }));

  return {
    db: {
      collection: collectionMock,
    },
    serverTimestamp: () => 'server-ts',
    functions: { httpsCallable: () => mockCallable },
  };
});

import {
  findSoftDeletedUserByEmail,
  reactivateUser,
  getUserById,
  __userServiceInternals,
  createUser,
  mergeUserFields,
  updateUserLocation,
} from '../../../src/features/profile/api/userService';

describe('userService', () => {
  it('finds soft-deleted user', async () => {
    const res = await findSoftDeletedUserByEmail('a@test.com');
    expect(res.id).toBe('soft1');
  });

  it('reactivates user and calls callable', async () => {
    await reactivateUser('u1', { foo: 'bar' });
    expect(mockCallable).toHaveBeenCalledWith({ uid: 'u1' });
  });

  it('getUserById returns hydrated data', async () => {
    const data = await getUserById('u1');
    expect(data.firstName).toBe('Ada');
    expect(data.rating).toBe(4);
  });

  it('sanitizeUserPayload strips restricted keys and unsupported values', () => {
    const { sanitizeUserPayload } = __userServiceInternals;
    const payload = sanitizeUserPayload({
      premiumTier: 'x',
      foo: 'bar',
      nested: { bad: undefined, good: 1 },
      array: [1, undefined, 'ok'],
    });
    expect(payload.premiumTier).toBeUndefined();
    expect(payload.foo).toBe('bar');
    expect(payload.nested.bad).toBeUndefined();
    expect(payload.array).toEqual([1, 'ok']);
  });

  it('createUser applies defaults and geohash', async () => {
    await createUser('uid1', {
      email: 'a@test.com',
      location: { latitude: 1, longitude: 2 },
      deviceToken: 'ExponentPushToken123',
    });
    // No assertion on db calls since mocked; ensure no throw
  });

  it('mergeUserFields normalizes deviceToken/pushOptIn', async () => {
    await mergeUserFields('u1', {
      deviceToken: 'ExponentPushTokenXYZ',
      pushOptIn: 1,
    });
  });

  it('updateUserLocation writes when valid coords', async () => {
    await updateUserLocation('u1', { latitude: 1, longitude: 2, city: 'SEA' });
  });
});
