// Description: Badge configuration system for managing different badge types and their properties

import betaBadgeImage from '../../../../assets/betaBadge.png';

// Badge configuration object - easy to extend with new badges
export const BADGE_CONFIG = {
  beta: {
    id: 'beta',
    name: 'Beta User',
    description: 'Early adopter of Social Circle',
    image: betaBadgeImage,
    rarity: 'common',
    color: '#FFD700', // Gold color for beta badge
  },
  // Future badges can be added here:
  // earlybird: {
  //   id: 'earlybird',
  //   name: 'Early Bird',
  //   description: 'Joins events within first hour',
  //   image: require('../../../../assets/earlyBirdBadge.png'),
  //   rarity: 'uncommon',
  //   color: '#FFA500',
  // },
  // socialite: {
  //   id: 'socialite',
  //   name: 'Socialite',
  //   description: 'Attended 50+ events',
  //   image: require('../../../../assets/socialiteBadge.png'),
  //   rarity: 'rare',
  //   color: '#9370DB',
  // },
};

// Default badge for new users
export const DEFAULT_BADGE = 'beta';

// Get badge configuration by badge ID
export const getBadgeConfig = (badgeId) => {
  return BADGE_CONFIG[badgeId] || BADGE_CONFIG[DEFAULT_BADGE];
};

// Get all available badges
export const getAllBadges = () => {
  return Object.values(BADGE_CONFIG);
};

// Check if badge exists
export const badgeExists = (badgeId) => {
  return badgeId in BADGE_CONFIG;
};
