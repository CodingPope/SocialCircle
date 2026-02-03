// Description: Firestore document schema reference for business collections
// Note: This is documentation only, not runtime validation

/**
 * businesses/{businessId}
 *
 * Main business profile document
 *
 * @typedef {Object} BusinessDocument
 * @property {string} ownerUid - User ID of the business owner
 * @property {string} tier - Business tier level (TIER_1_FREE | TIER_2_GROWTH | TIER_3_LANDMARK | TIER_4_ENTERPRISE)
 * @property {string} businessType - Type of business (STOREFRONT | SERVICE_AREA | MULTI_LOCATION)
 * @property {string} name - Business name
 * @property {string} primaryCategoryId - Reference to categories/{categoryId}
 * @property {string[]} interestIds - Array of interest IDs from interests collection
 * @property {string} [about] - Optional business description/bio
 * @property {string} [website] - Optional website URL
 * @property {string} [phonePublic] - Optional public phone number
 * @property {string} [emailPublic] - Optional public email address
 * @property {FirebaseFirestore.Timestamp} createdAt - Account creation timestamp
 * @property {FirebaseFirestore.Timestamp} [updatedAt] - Last profile update timestamp
 * @property {boolean} [isActive] - Whether business is active (default true)
 * @property {Object} [metadata] - Optional metadata for future features
 */

/**
 * businesses/{businessId}/locations/{locationId}
 *
 * Physical location subcollection (for STOREFRONT and MULTI_LOCATION types)
 *
 * @typedef {Object} BusinessLocationDocument
 * @property {string} name - Location name (e.g., "Downtown Store", "Main Office")
 * @property {string} address - Full address string
 * @property {Object} coordinates - GeoPoint coordinates
 * @property {number} coordinates.latitude - Latitude
 * @property {number} coordinates.longitude - Longitude
 * @property {string} [placeId] - Google Places ID for verification
 * @property {boolean} isPrimary - Whether this is the primary location
 * @property {FirebaseFirestore.Timestamp} createdAt - Creation timestamp
 * @property {boolean} [isActive] - Whether location is active (default true)
 */

/**
 * businesses/{businessId}/serviceAreas/{serviceAreaId}
 *
 * Service area subcollection (for SERVICE_AREA type businesses)
 *
 * @typedef {Object} BusinessServiceAreaDocument
 * @property {string} name - Area name (e.g., "Downtown", "North Seattle", "98101")
 * @property {string} type - Area type (ZIP | CITY | RADIUS | NEIGHBORHOOD)
 * @property {string} [zipCode] - Zip code if type is ZIP
 * @property {string} [cityName] - City name if type is CITY
 * @property {Object} [centerPoint] - Center coordinates for RADIUS type
 * @property {number} [centerPoint.latitude] - Latitude
 * @property {number} [centerPoint.longitude] - Longitude
 * @property {number} [radiusMiles] - Radius in miles for RADIUS type
 * @property {FirebaseFirestore.Timestamp} createdAt - Creation timestamp
 * @property {boolean} [isActive] - Whether service area is active (default true)
 */

/**
 * perks/{perkId}
 *
 * Business perk/offer document (Tier 2+)
 *
 * @typedef {Object} PerkDocument
 * @property {string} businessId - Reference to businesses/{businessId}
 * @property {string} title - Perk offer title (e.g., "15% off large coffee")
 * @property {string} details - Perk description/terms
 * @property {FirebaseFirestore.Timestamp} expiresAt - Required expiration timestamp
 * @property {string[]} interestIds - Interest targeting (tier-limited)
 * @property {string} [businessLocationId] - Reference to location (for STOREFRONT/MULTI_LOCATION)
 * @property {string} [serviceAreaId] - Reference to service area (for SERVICE_AREA)
 * @property {number} targetRadiusMiles - Targeting radius (tier-limited max)
 * @property {Object} [coordinates] - Center point for radius targeting
 * @property {number} [coordinates.latitude] - Latitude
 * @property {number} [coordinates.longitude] - Longitude
 * @property {FirebaseFirestore.Timestamp} createdAt - Creation timestamp
 * @property {boolean} isActive - Whether perk is currently active
 * @property {number} [saveCount] - Number of times saved by users
 * @property {number} [viewCount] - Number of times viewed
 */

/**
 * Extended event fields for business-hosted events
 *
 * Existing events collection with additional fields:
 * @property {string} [hostType] - 'USER' | 'BUSINESS'
 * @property {string} [businessId] - Reference to businesses/{businessId} if hostType is BUSINESS
 * @property {string} [businessLocationId] - Reference to location if applicable
 * @property {string} [serviceAreaId] - Reference to service area if applicable
 */

// Export schema types for reference
export const BUSINESS_SCHEMA = {
  COLLECTIONS: {
    BUSINESSES: 'businesses',
    LOCATIONS: 'locations', // subcollection
    SERVICE_AREAS: 'serviceAreas', // subcollection
    PERKS: 'perks',
  },
  SERVICE_AREA_TYPES: {
    ZIP: 'ZIP',
    CITY: 'CITY',
    RADIUS: 'RADIUS',
    NEIGHBORHOOD: 'NEIGHBORHOOD',
  },
  HOST_TYPES: {
    USER: 'USER',
    BUSINESS: 'BUSINESS',
  },
};
