// Description: Category pin configuration for map markers
export const CATEGORY_PINS = {
  active_outdoors: {
    emoji: '🏔️',
    color: '#4CAF50',
    name: 'Active Outdoors',
  },
  arts_hobbies: {
    emoji: '🎨',
    color: '#9C27B0',
    name: 'Arts & Hobbies',
  },
  volunteering_community: {
    emoji: '🤝',
    color: '#FF9800',
    name: 'Volunteering & Community',
  },
  family_kids: {
    emoji: '👨‍👩‍👧‍👦',
    color: '#E91E63',
    name: 'Family & Kids',
  },
  food_drink: {
    emoji: '🍽️',
    color: '#FF5722',
    name: 'Food & Drink',
  },
  music_entertainment: {
    emoji: '🎵',
    color: '#673AB7',
    name: 'Music & Entertainment',
  },
  pets_animals: {
    emoji: '🐕',
    color: '#795548',
    name: 'Pets & Animals',
  },
  social_chill: {
    emoji: '😎',
    color: '#FFC107',
    name: 'Social & Chill',
  },
  sports_recreation: {
    emoji: '⚽',
    color: '#2196F3',
    name: 'Sports & Recreation',
  },
  tabletop_gaming: {
    emoji: '🎲',
    color: '#607D8B',
    name: 'Tabletop Gaming',
  },
  wellness: {
    emoji: '🧘',
    color: '#00BCD4',
    name: 'Wellness',
  },
  video_gaming: {
    emoji: '🎮',
    color: '#3F51B5',
    name: 'Video Gaming',
  },
};

// Mapping of interest names to category IDs (derived from categories.json)
const INTEREST_TO_CATEGORY = {
  // Active Outdoors
  Hiking: 'active_outdoors',
  'Trail Running': 'active_outdoors',
  Backpacking: 'active_outdoors',
  Cycling: 'active_outdoors',
  'Mountain Biking': 'active_outdoors',
  Climbing: 'active_outdoors',
  Skiing: 'active_outdoors',
  Snowboarding: 'active_outdoors',
  Rafting: 'active_outdoors',
  Fishing: 'active_outdoors',
  Paddleboarding: 'active_outdoors',
  Kayaking: 'active_outdoors',
  Yoga: 'active_outdoors',

  // Arts & Hobbies
  'Sip and Paint': 'arts_hobbies',
  'Art Galleries': 'arts_hobbies',
  Photography: 'arts_hobbies',
  Painting: 'arts_hobbies',
  Pottery: 'arts_hobbies',
  'DIY Crafts': 'arts_hobbies',
  'Knitting and Crochet': 'arts_hobbies',
  'Maker Nights': 'arts_hobbies',
  'Book Club': 'arts_hobbies',
  Writing: 'arts_hobbies',
  'Film Nights': 'arts_hobbies',
  Improv: 'arts_hobbies',
  Theater: 'arts_hobbies',
  Cosplay: 'arts_hobbies',
  'Anime Nights': 'arts_hobbies',

  // Volunteering & Community
  Cleanups: 'volunteering_community',
  'Food Bank': 'volunteering_community',
  'Animal Shelter': 'volunteering_community',
  'Donation Drives': 'volunteering_community',
  'Community Events': 'volunteering_community',
  'Mutual Aid': 'volunteering_community',
  'Blood Drives': 'volunteering_community',

  // Family & Kids
  Playdates: 'family_kids',
  'Family Picnics': 'family_kids',
  'Kids Sports': 'family_kids',
  'Holiday Crafts': 'family_kids',
  'Zoo Trips': 'family_kids',
  'Museum Days': 'family_kids',
  'Stroller Walks': 'family_kids',
  'Family Rides': 'family_kids',
  'Seasonal Outings': 'family_kids',

  // Food & Drink
  Breweries: 'food_drink',
  'Food Festivals': 'food_drink',
  Brunch: 'food_drink',
  Lunch: 'food_drink',
  Dinner: 'food_drink',
  'Wine Tastings': 'food_drink',
  'Vegan Meetups': 'food_drink',
  'Farmers Markets': 'food_drink',
  'Food Trucks': 'food_drink',

  // Music & Entertainment
  'Live Music': 'music_entertainment',
  'Open Mic': 'music_entertainment',
  Karaoke: 'music_entertainment',
  Salsa: 'music_entertainment',
  EDM: 'music_entertainment',
  'DJ Nights': 'music_entertainment',
  Jazz: 'music_entertainment',
  'House Shows': 'music_entertainment',
  Comedy: 'music_entertainment',
  'Drum Circles': 'music_entertainment',

  // Pets & Animals
  'Dog Park Meetups': 'pets_animals',
  'Dog Hikes': 'pets_animals',
  'Puppy Socials': 'pets_animals',
  'Cat Meetups': 'pets_animals',
  Birding: 'pets_animals',
  'Horseback Rides': 'pets_animals',

  // Social & Chill
  'Game Nights': 'social_chill',
  Trivia: 'social_chill',
  'Watch Parties': 'social_chill',
  Walks: 'social_chill',
  'Rooftop Hangouts': 'social_chill',
  'Bar Crawls': 'social_chill',
  Picnics: 'social_chill',
  'Park Hangouts': 'social_chill',
  Bonfires: 'social_chill',
  'Coffee Meetups': 'social_chill',
  'Language Exchange': 'social_chill',
  'Pool Parties': 'social_chill',
  'Happy Hour': 'social_chill',
  'House Parties': 'social_chill',
  Afters: 'social_chill',
  'Cars and Coffee': 'social_chill',
  'Car Meets': 'social_chill',
  'Cruise Nights': 'social_chill',

  // Sports & Recreation
  Volleyball: 'sports_recreation',
  Basketball: 'sports_recreation',
  Soccer: 'sports_recreation',
  'Flag Football': 'sports_recreation',
  Softball: 'sports_recreation',
  Kickball: 'sports_recreation',
  Pickleball: 'sports_recreation',
  'Axe Throwing': 'sports_recreation',
  'Mini Golf': 'sports_recreation',
  Bowling: 'sports_recreation',
  'Table Tennis': 'sports_recreation',
  Tennis: 'sports_recreation',
  'Disc Golf': 'sports_recreation',
  Skateboarding: 'sports_recreation',
  'Roller Skating': 'sports_recreation',
  Golf: 'sports_recreation',
  'Ice Skating': 'sports_recreation',
  'Indoor Rock Climbing': 'sports_recreation',

  // Tabletop Gaming
  'Board Games': 'tabletop_gaming',
  'Strategy Games': 'tabletop_gaming',
  'RPG Campaigns': 'tabletop_gaming',
  'Magic: The Gathering': 'tabletop_gaming',
  Pokémon: 'tabletop_gaming',
  Catan: 'tabletop_gaming',
  Mahjong: 'tabletop_gaming',
  Chess: 'tabletop_gaming',
  Backgammon: 'tabletop_gaming',
  Scrabble: 'tabletop_gaming',
  Bingo: 'tabletop_gaming',

  // Wellness
  Meditation: 'wellness',
  Breathwork: 'wellness',
  'Stretch and Mobility': 'wellness',

  // Video Gaming
  'Video Games': 'video_gaming',
  'Arcade Nights': 'video_gaming',
  'LAN and PC Nights': 'video_gaming',
};

// Default fallback for unknown categories
const DEFAULT_PIN = {
  emoji: '📍',
  color: '#9E9E9E',
  name: 'Event',
};

// Description: Get category config for an event
// Works with both event.categories array and event.interest string
export const getCategoryConfig = (event) => {
  // Try categories array first (future structure)
  if (Array.isArray(event?.categories) && event.categories.length > 0) {
    const primaryCategory = event.categories[0];
    return CATEGORY_PINS[primaryCategory] || DEFAULT_PIN;
  }

  // Fall back to interest-based lookup (current structure)
  if (event?.interest) {
    const interestName =
      typeof event.interest === 'string'
        ? event.interest
        : event.interest?.name || '';

    const categoryId = INTEREST_TO_CATEGORY[interestName];
    if (categoryId && CATEGORY_PINS[categoryId]) {
      return CATEGORY_PINS[categoryId];
    }
  }

  // Try category field (alternative structure)
  if (event?.category && CATEGORY_PINS[event.category]) {
    return CATEGORY_PINS[event.category];
  }

  return DEFAULT_PIN;
};

// Description: Get unique category IDs from a list of interest names
// This requires loading categories.json to map interests to categories
// For now, this is a placeholder that would need the full category data
export const getCategoriesFromInterests = (interestNames, categoriesData) => {
  if (!Array.isArray(interestNames) || !Array.isArray(categoriesData)) {
    return [];
  }

  const categorySet = new Set();

  categoriesData.forEach((category) => {
    if (!category.interests) return;

    const hasMatchingInterest = category.interests.some((interest) =>
      interestNames.includes(interest.name)
    );

    if (hasMatchingInterest && category.id !== 'popular') {
      categorySet.add(category.id);
    }
  });

  return Array.from(categorySet);
};
