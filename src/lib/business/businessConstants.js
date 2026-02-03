// Description: Business mode constants for tier levels and business types

/**
 * Business tier levels with stable keys
 * These exact strings are stored in Firestore businesses/{businessId}.tier
 */
export const BUSINESS_TIERS = {
  TIER_1_FREE: 'TIER_1_FREE',
  TIER_2_GROWTH: 'TIER_2_GROWTH',
  TIER_3_LANDMARK: 'TIER_3_LANDMARK',
  TIER_4_ENTERPRISE: 'TIER_4_ENTERPRISE',
};

/**
 * Default tier for new business accounts
 */
export const DEFAULT_TIER = BUSINESS_TIERS.TIER_1_FREE;

/**
 * Business location/service types
 * Stored in Firestore businesses/{businessId}.businessType
 */
export const BUSINESS_TYPES = {
  STOREFRONT: 'STOREFRONT', // Physical location with address
  SERVICE_AREA: 'SERVICE_AREA', // No physical location, serves areas
  MULTI_LOCATION: 'MULTI_LOCATION', // Multiple physical locations
};

/**
 * Analytics access levels by tier
 */
export const ANALYTICS_LEVELS = {
  BASIC: 'basic', // RSVP count only
  FULL: 'full', // Views, saves, RSVPs, perk saves
  ADVANCED: 'advanced', // Full + advanced metrics (future)
};
