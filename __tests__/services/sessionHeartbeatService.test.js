// Description: Tests for daily session heartbeat logic
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/features/profile/api/userService', () => ({
  mergeUserFields: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/firebase/config', () => ({
  serverTimestamp: () => 'server-ts',
}));

jest.mock('../../src/services/analyticsService', () => ({
  event: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/lib/analytics', () => ({
  trackSessionStart: jest.fn(() => Promise.resolve()),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeUserFields } from '../../src/features/profile/api/userService';
import { event as analyticsEvent } from '../../src/services/analyticsService';
import { trackSessionStart } from '../../src/lib/analytics';
import { recordDailySessionHeartbeat } from '../../src/services/sessionHeartbeatService';

describe('sessionHeartbeatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips when no user', async () => {
    await recordDailySessionHeartbeat(null);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('writes heartbeat when not already recorded today', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    const user = { uid: 'u1' };
    await recordDailySessionHeartbeat(user);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
    expect(mergeUserFields).toHaveBeenCalledWith('u1', expect.any(Object));
    expect(analyticsEvent).toHaveBeenCalledWith(
      'session_start',
      expect.objectContaining({ cadence: 'daily' })
    );
    expect(trackSessionStart).toHaveBeenCalled();
  });

  it('does not double-write within same day', async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(now.getDate()).padStart(2, '0')}`;
    AsyncStorage.getItem.mockResolvedValueOnce(today); // cached for today
    const user = { uid: 'u1' };
    await recordDailySessionHeartbeat(user);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(mergeUserFields).not.toHaveBeenCalled();
  });
});
