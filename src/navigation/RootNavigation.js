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
  navigate('OtherUserProfile', { userId });
}

export function navigateToEventChat(eventId) {
  navigate('EventChat', { eventId });
}
