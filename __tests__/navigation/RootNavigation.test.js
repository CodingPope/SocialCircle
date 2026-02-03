// Description: Tests for navigation helpers and guards
let navInstance;

jest.mock('@react-navigation/native', () => {
  const nav = {
    navigate: jest.fn(),
    reset: jest.fn(),
    isReady: jest.fn(() => true),
    getRootState: jest.fn(() => ({})),
  };
  navInstance = nav;
  return {
    createNavigationContainerRef: jest.fn(() => nav),
  };
});

import {
  navigate,
  resetRoot,
  navigateToOtherUserProfile,
  navigateToEventChat,
  navigateToInterestPost,
  navigationRef,
} from '../../src/navigation/RootNavigation';
import ROUTES from '../../src/navigation/routes';

describe('RootNavigation helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    navInstance.isReady.mockReturnValue(true);
  });

  it('navigate no-ops when not ready', () => {
    navInstance.isReady.mockReturnValue(false);
    navigate('ScreenA', { foo: 1 });
    expect(navInstance.navigate).not.toHaveBeenCalled();
  });

  it('navigate calls underlying ref when ready', () => {
    navigate('ScreenA', { foo: 1 });
    expect(navInstance.navigate).toHaveBeenCalledWith('ScreenA', { foo: 1 });
  });

  it('resetRoot resets when ready', () => {
    resetRoot([{ name: ROUTES.AUTH }]);
    expect(navInstance.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: ROUTES.AUTH }],
    });
  });

  it('navigateToOtherUserProfile includes origin tab', () => {
    navInstance.getRootState.mockReturnValue({
      routes: [
        {
          name: ROUTES.MAIN_TABS,
          state: { index: 0, routes: [{ name: ROUTES.MAP }] },
        },
      ],
    });
    navigateToOtherUserProfile('u123');
    expect(navInstance.navigate).toHaveBeenCalledWith(ROUTES.MAIN_TABS, {
      screen: ROUTES.PROFILE_STACK,
      params: {
        screen: ROUTES.OTHER_USER_PROFILE,
        params: { userId: 'u123', originTab: ROUTES.MAP },
      },
    });
  });

  it('navigateToEventChat forwards eventId', () => {
    navigateToEventChat('evt-1', { from: 'test' });
    expect(navInstance.navigate).toHaveBeenCalledWith(ROUTES.EVENT_CHAT, {
      eventId: 'evt-1',
      from: 'test',
    });
  });

  it('navigateToInterestPost forwards postId', () => {
    navigateToInterestPost('post-9', { title: 't' });
    expect(navInstance.navigate).toHaveBeenCalledWith(ROUTES.INTEREST_POST, {
      postId: 'post-9',
      initialPost: { title: 't' },
    });
  });

  it('exports same navigationRef instance', () => {
    expect(navigationRef.navigate).toBe(navInstance.navigate);
  });
});
