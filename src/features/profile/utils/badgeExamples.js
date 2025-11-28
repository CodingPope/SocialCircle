// Description: Example usage of the badge system for future reference

/*
Example usage of the badge system:

1. Award a badge to a user (like when they complete an action):
   ```javascript
   import { awardBadge } from '../api/badgeService';
   
   // Award beta badge to new user
   await awardBadge(userId, 'beta', true); // true to set as current badge
   ```

2. Add new badges to the system:
   ```javascript
   // In badgeConfig.js, add to BADGE_CONFIG:
   earlybird: {
     id: 'earlybird',
     name: 'Early Bird',
     description: 'Joins events within first hour',
     image: require('../../../../assets/earlyBirdBadge.png'),
     rarity: 'uncommon',
     color: '#FFA500',
   }
   ```

3. Change user's displayed badge:
   ```javascript
   import { setCurrentBadge } from '../api/badgeService';
   
   await setCurrentBadge(userId, 'earlybird');
   ```

4. Get all user badges for display:
   ```javascript
   import { getUserBadges } from '../api/badgeService';
   
   const badges = await getUserBadges(userId);
   badges.forEach(badge => {
     console.log(`${badge.name}: ${badge.description} (Current: ${badge.isCurrent})`);
   });
   ```

5. Future badge ideas:
   - Social Butterfly: Attended 10+ events
   - Event Creator: Created 5+ events  
   - Popular: Has 100+ friends
   - Veteran: Account older than 1 year
   - Verified: Verified account
   - Premium: Premium subscriber
   - Community Helper: Reported content that was actioned
   - Early Adopter: Joined in first month
   - Party Animal: Attended events 5 days in a row
   - Explorer: Attended events in 5+ different cities
*/
