import categoriesData from '../features/events/constants/categoriesData.json';

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
};

// Mapping of interest names to category IDs (derived from categoriesData.json)
const buildInterestMap = (categories) => {
  const result = {};
  categories.forEach((category) => {
    const categoryId = category?.id;
    if (!categoryId || !Array.isArray(category?.interests)) return;
    category.interests.forEach((interest) => {
      const name = interest?.name;
      if (!name || result[name]) return;
      result[name] = categoryId;
    });
  });
  return result;
};

const INTEREST_TO_CATEGORY = buildInterestMap(categoriesData);

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
