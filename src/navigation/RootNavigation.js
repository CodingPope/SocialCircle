// src/navigation/RootNavigation.js

import { createNavigationContainerRef } from '@react-navigation/native';

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

// Convenience helpers
export function navigateToOtherUserProfile(userId) {
  if (!userId) return;
  navigate('MainTabs', {
    screen: 'ProfileStack',
    params: {
      screen: 'OtherUserProfile',
      params: { userId },
    },
  });
}

export function navigateToEventChat(eventId) {
  navigate('EventChat', { eventId });
}

export function navigateToInterestPost(postId, initialPost) {
  navigate('InterestPost', { postId, initialPost });
}
