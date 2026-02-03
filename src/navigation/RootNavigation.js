// src/navigation/RootNavigation.js

import { createNavigationContainerRef } from '@react-navigation/native';
import ROUTES from './routes';

export const navigationRef = createNavigationContainerRef();

// Generic navigate
export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}

// Reset root navigation (useful after login/logout)
export function resetRoot(routes) {
  if (navigationRef.isReady()) {
    navigationRef.reset({
      index: 0,
      routes,
    });
  }
}

function getActiveMainTab() {
  try {
    const state = navigationRef.getRootState?.();
    if (!state?.routes?.length) return null;
    const mainTabsRoute = state.routes.find((r) => r.name === ROUTES.MAIN_TABS);
    if (!mainTabsRoute) return null;
    const tabState = mainTabsRoute.state;
    if (tabState?.routes?.length) {
      const index = tabState.index ?? 0;
      return tabState.routes[index]?.name ?? null;
    }
    const paramsScreen = mainTabsRoute.params?.screen;
    if (typeof paramsScreen === 'string') return paramsScreen;
    return null;
  } catch {
    return null;
  }
}

// Convenience helpers
export function navigateToOtherUserProfile(userId) {
  if (!userId) return;
  const originTab = getActiveMainTab();
  navigate(ROUTES.MAIN_TABS, {
    screen: ROUTES.PROFILE_STACK,
    params: {
      screen: ROUTES.OTHER_USER_PROFILE,
      params: { userId, originTab },
    },
  });
}

export function navigateToEventChat(eventId, extraParams = {}) {
  if (!eventId) return;
  navigate(ROUTES.EVENT_CHAT, { eventId, ...extraParams });
}

export function navigateToInterestPost(postId, initialPost) {
  navigate(ROUTES.INTEREST_POST, { postId, initialPost });
}
