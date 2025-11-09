// Description: Utility to manually clear the user snippet cache
// This will force a refresh of all cached user data including profile images

import { useUserSnippetStore } from '../features/profile/stores/userSnippetStore';

// Clear entire cache - all users will be refetched
export function clearAllUserSnippets() {
  const clearCache = useUserSnippetStore.getState().clearCache;
  if (clearCache) {
    clearCache();
    console.log('✅ Cleared all user snippet cache');
    return true;
  }
  console.warn('⚠️  clearCache function not available');
  return false;
}

// Clear cache for specific user
export function clearUserSnippet(uid) {
  const clearUser = useUserSnippetStore.getState().clearUser;
  if (clearUser && uid) {
    clearUser(uid);
    console.log(`✅ Cleared snippet cache for user ${uid}`);
    return true;
  }
  console.warn('⚠️  clearUser function not available or uid missing');
  return false;
}

// Example usage:
// import { clearAllUserSnippets, clearUserSnippet } from './src/utils/clearUserCache';
// clearAllUserSnippets(); // Clear everything
// clearUserSnippet('some-user-id'); // Clear specific user
