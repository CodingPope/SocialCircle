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
const INTEREST_TO_CATEGORY = {
  // Active Outdoors
  Hiking: 'active_outdoors',
  Yoga: 'active_outdoors',
  Cycling: 'active_outdoors',
  'Beach Days': 'active_outdoors',
  Kayaking: 'active_outdoors',
  'Group Workouts': 'active_outdoors',
  Snowshoeing: 'active_outdoors',
  'Beach Walks': 'active_outdoors',
  'eBike Cruising': 'active_outdoors',
  Surfing: 'active_outdoors',
  'Trail Running': 'active_outdoors',
  'Casual Walks': 'active_outdoors',
  'Lake Hangouts': 'active_outdoors',
  Pilates: 'active_outdoors',
  'Mountain Biking': 'active_outdoors',
  'Running Groups': 'active_outdoors',
  'Paddle Boarding': 'active_outdoors',
  Climbing: 'active_outdoors',
  'Cold Plunge & Sauna': 'active_outdoors',

  // Arts & Hobbies
  Cosplay: 'arts_hobbies',
  'Craft Nights': 'arts_hobbies',
  'Sip & Paint': 'arts_hobbies',
  'Art Gallery': 'arts_hobbies',
  'Book Club': 'arts_hobbies',
  Pottery: 'arts_hobbies',
  'Knitting/Crochet Circles': 'arts_hobbies',
  Painting: 'arts_hobbies',
  Photography: 'arts_hobbies',
  Poetry: 'arts_hobbies',
  Baking: 'arts_hobbies',
  'Creative Writing': 'arts_hobbies',
  Cooking: 'arts_hobbies',
  'Film Screenings': 'arts_hobbies',
  'Improv Nights': 'arts_hobbies',
  'Theater Nights': 'arts_hobbies',
  'Anime Watch Parties': 'arts_hobbies',
  'DIY Projects': 'arts_hobbies',

  // Volunteering & Community
  Charity: 'volunteering_community',
  'Neighborhood Cleanups': 'volunteering_community',
  'Animal Shelter Help': 'volunteering_community',
  'Soup Kitchen Volunteering': 'volunteering_community',
  'Book Drives': 'volunteering_community',
  'Community Game Nights': 'volunteering_community',
  'Local Festivals': 'volunteering_community',

  // Family & Kids
  'Family Picnics': 'family_kids',
  'Outdoor Crafts with Kids': 'family_kids',
  'Mini Sports for Kids': 'family_kids',
  'Storytime Meetups': 'family_kids',
  'Holiday Crafting with Kids': 'family_kids',
  'Zoo Trips': 'family_kids',
  'Parent Support Groups': 'family_kids',
  'Park Playdates': 'family_kids',
  'Parents Beach Play Days': 'family_kids',
  'Family Bike Rides': 'family_kids',

  // Food & Drink
  'Food Festivals': 'food_drink',
  Potluck: 'food_drink',
  'Wine Tastings': 'food_drink',
  'Farmers Markets': 'food_drink',
  'Brunch Meetup': 'food_drink',
  'Luunch Meetup': 'food_drink',
  'Dinner Parties': 'food_drink',
  'Sushi Nights': 'food_drink',
  'Dessert Crawls': 'food_drink',
  'Food Trucks': 'food_drink',
  'BBQ Cookouts': 'food_drink',
  Hotpot: 'food_drink',
  'Vegan Meetups': 'food_drink',
  'Coffee Meetup': 'food_drink',

  // Music & Entertainment
  'Jam Sessions': 'music_entertainment',
  'Acoustic Nights': 'music_entertainment',
  'House Concerts': 'music_entertainment',
  'Salsa Dancing Nights': 'music_entertainment',
  'Open Mic Nights': 'music_entertainment',
  Concerts: 'music_entertainment',
  'Live Music': 'music_entertainment',
  EDM: 'music_entertainment',
  'Dance Socials': 'music_entertainment',
  'DJ Nights': 'music_entertainment',
  'Hip Hop': 'music_entertainment',
  'Drum Circles': 'music_entertainment',
  'Jazz Nights': 'music_entertainment',
  'Folk Music Hangouts': 'music_entertainment',
  'Karaoke Nights': 'music_entertainment',
  Afters: 'music_entertainment',

  // Pets & Animals
  Pets: 'pets_animals',
  'Bird Watching ': 'pets_animals',
  'Puppy Socials': 'pets_animals',
  'Horseback Trail Rides': 'pets_animals',
  'Group Dog Walks': 'pets_animals',
  'Dog-Friendly Hiking Trips': 'pets_animals',
  'Puppy Training Circles': 'pets_animals',
  'Cat Meetups': 'pets_animals',
  'Dog Meetups': 'pets_animals',

  // Social & Chill
  Picnics: 'social_chill',
  Festivals: 'social_chill',
  Conventions: 'social_chill',
  'Game Nights': 'social_chill',
  'Park Hangouts': 'social_chill',
  'Bar Crawl': 'social_chill',
  'Watch Parties': 'social_chill',
  'Board Game Cafes': 'social_chill',
  'Movie Nights': 'social_chill',
  'Beer Gardens': 'social_chill',
  'Card Game Nights': 'social_chill',
  'Farmers Market': 'social_chill',
  'Pool Parties': 'social_chill',
  'Trivia Nights': 'social_chill',
  'House Parties': 'social_chill',
  'Brunch Meetups': 'social_chill',
  Bonfires: 'social_chill',
  'Happy Hour Drinks': 'social_chill',
  'Sunset Watch Parties': 'social_chill',
  'Cars & Coffee': 'social_chill',
  'Car Meetups': 'social_chill',
  'Cruise Nights': 'social_chill',

  // Sports & Recreation
  'Mini Golf': 'sports_recreation',
  'Indoor Rock Climbing': 'sports_recreation',
  Badminton: 'sports_recreation',
  Kickball: 'sports_recreation',
  Volleyball: 'sports_recreation',
  Bowling: 'sports_recreation',
  'Beach Volleyball': 'sports_recreation',
  'Pick-Up Games': 'sports_recreation',
  Softball: 'sports_recreation',
  'Table Tennis': 'sports_recreation',
  Tennis: 'sports_recreation',
  'Disc Golf': 'sports_recreation',
  Skateboarding: 'sports_recreation',
  Golf: 'sports_recreation',
  Soccer: 'sports_recreation',
  'Ultimate Frisbee': 'sports_recreation',
  'Roller Skating': 'sports_recreation',
  'Flag Football': 'sports_recreation',
  Pickleball: 'sports_recreation',
  Dodgeball: 'sports_recreation',
  Basketball: 'sports_recreation',
  Billiards: 'sports_recreation',

  // Tabletop Gaming
  'Magic: The Gathering Nights': 'tabletop_gaming',
  'Strategy Game Nights': 'tabletop_gaming',
  'Board Games': 'tabletop_gaming',
  'Bingo Nights': 'tabletop_gaming',
  'Pokemon Card Tournaments': 'tabletop_gaming',
  'Catan Tournaments': 'tabletop_gaming',
  'Mahjong Nights': 'tabletop_gaming',
  'Chess Meetups': 'tabletop_gaming',
  'RPG Campaigns (D&D, etc.)': 'tabletop_gaming',
  'Backgammon Nights': 'tabletop_gaming',
  'Scrabble Tournaments': 'tabletop_gaming',
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
