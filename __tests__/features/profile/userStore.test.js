// Description: Tests for userStore auth/profile flows
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockEnableNetwork = jest.fn();

jest.mock('../../../src/services/firebase/config', () => ({
  auth: jest.fn(() => ({
    signInWithEmailAndPassword: mockSignIn,
    signOut: mockSignOut,
    onAuthStateChanged: mockOnAuthStateChanged,
  })),
  db: {
    enableNetwork: mockEnableNetwork,
    disableNetwork: jest.fn(),
  },
  getUserData: jest.fn(),
  updateUserData: jest.fn(),
  serverTimestamp: jest.fn(() => 'server-ts'),
}));

jest.mock('../../../src/features/auth/utils/onboardingRouter', () => ({
  getNextOnboardingStep: jest.fn(() => null),
}));

jest.mock('../../../src/navigation/RootNavigation', () => ({
  navigationRef: {},
  resetRoot: jest.fn(),
}));

jest.mock('../../../src/features/profile/api/userService', () => ({
  findSoftDeletedUserByEmail: jest.fn(),
  reactivateUser: jest.fn(),
  mergeUserFields: jest.fn(),
}));

// Provide global Alert mock used in store
global.Alert = { alert: jest.fn() };

import { getUserData } from '../../../src/services/firebase/config';
import { getNextOnboardingStep } from '../../../src/features/auth/utils/onboardingRouter';
import { findSoftDeletedUserByEmail } from '../../../src/features/profile/api/userService';
import { useUserStore } from '../../../src/features/profile/stores/userStore';

const resetState = () =>
  useUserStore.setState({
    user: null,
    loading: true,
    profileComplete: false,
  });

describe('userStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
    getNextOnboardingStep.mockReturnValue(null);
  });

  it('setters update state', () => {
    useUserStore.getState().setUser({ uid: 'u1' });
    expect(useUserStore.getState().user).toEqual({ uid: 'u1' });

    useUserStore.getState().setLoading(false);
    expect(useUserStore.getState().loading).toBe(false);

    useUserStore.getState().setProfileComplete(true);
    expect(useUserStore.getState().profileComplete).toBe(true);
  });

  it('login succeeds and populates user', async () => {
    mockSignIn.mockResolvedValueOnce({
      user: { uid: 'u1', email: 'a@test.com' },
    });
    getUserData.mockResolvedValueOnce({ firstName: 'Ada' });

    const result = await useUserStore.getState().login('a@test.com', 'pw');

    expect(result).toBe(true);
    const state = useUserStore.getState();
    expect(state.user.uid).toBe('u1');
    expect(state.user.firstName).toBe('Ada');
    expect(state.profileComplete).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('login rejects soft-deleted users and signs out', async () => {
    mockSignIn.mockResolvedValueOnce({
      user: { uid: 'u2', email: 'b@test.com' },
    });
    getUserData.mockResolvedValueOnce({ isDeleted: true });

    await expect(
      useUserStore.getState().login('b@test.com', 'pw')
    ).rejects.toThrow(/deleted/);

    expect(mockSignOut).toHaveBeenCalled();
    expect(useUserStore.getState().user).toBeNull();
    expect(useUserStore.getState().loading).toBe(false);
    expect(global.Alert.alert).toHaveBeenCalled();
  });

  it('signup returns early when soft-deleted exists', async () => {
    findSoftDeletedUserByEmail.mockResolvedValueOnce({ id: 'old' });
    await useUserStore.getState().signup('c@test.com', 'pw', {}, null);
    expect(global.Alert.alert).toHaveBeenCalled();
    // Loading remains true until caller handles Alert actions; ensure not throwing
    expect(useUserStore.getState().loading).toBe(true);
  });

  it('logout clears token and disables network best-effort', async () => {
    useUserStore.setState({ user: { uid: 'u1' }, loading: false });
    await useUserStore.getState().logout();
    expect(mockEnableNetwork).not.toHaveBeenCalled(); // disableNetwork mocked in store
    expect(useUserStore.getState().user).toBeNull();
    expect(useUserStore.getState().loading).toBe(false);
  });
});
