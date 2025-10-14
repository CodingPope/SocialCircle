# Auth Usage Update Guide

## The Issue

React Native Firebase's `auth` is a **function**, not an object. You must call `auth()` to get the auth instance.

### ❌ Wrong (Web SDK style):
```javascript
import { auth } from '../firebase/config';

// This will fail:
const user = auth.currentUser;
```

### ✅ Correct (React Native Firebase):
```javascript
import { auth } from '../firebase/config';

// Call auth() to get the instance:
const user = auth().currentUser;
```

## Files That Need Updating

All files that use `auth.currentUser` need to be updated to `auth().currentUser`:

1. `src/features/chat/components/EventChatScreen.js` (19 occurrences)
2. `src/features/profile/services/userQueries.js` (1 occurrence)
3. `src/features/interestPosts/services/interestPostService.js` (1 occurrence)
4. `src/features/profile/stores/interestStore.js` (2 occurrences)
5. `src/features/events/components/CreateEventScreen.js` (commented debug line)

## Quick Fix Command

Run this to update all files:
```bash
cd /Users/thepope/Documents/SocialCircle/src

# Update auth.currentUser to auth().currentUser
find . -type f -name "*.js" -exec sed -i '' 's/auth\.currentUser/auth().currentUser/g' {} \;

# Fix any double parentheses (in case some files already had auth())
find . -type f -name "*.js" -exec sed -i '' 's/auth()()\.currentUser/auth().currentUser/g' {} \;
```

## Status

⏳ iOS build currently running - will need to test after build completes
