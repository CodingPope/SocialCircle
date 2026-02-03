// Description: Single source of truth for business tier capabilities and limits

import { BUSINESS_TIERS, ANALYTICS_LEVELS } from './businessConstants';

/**
 * Get capability limits and features for a given business tier
 *
 * @param {string} tier - One of BUSINESS_TIERS values
 * @returns {Object} Capability configuration
 * @returns {number} monthlyEventLimit - Max events per 30 days (Infinity = unlimited)
 * @returns {number} monthlyPerkLimit - Max perks per 30 days (Infinity = unlimited)
 * @returns {number} monthlyPostLimit - Alias for monthlyEventLimit (kept for spec compatibility)
 * @returns {number} maxActiveEvents - Max concurrent upcoming events
 * @returns {number} maxActivePerks - Max concurrent active perks
 * @returns {boolean} canCreatePerk - Whether tier allows perk creation
 * @returns {number} interestSlots - Max interests (Infinity = unlimited)
 * @returns {number} categorySlots - Max categories (Infinity = unlimited)
 * @returns {number} maxTargetRadiusMiles - Max radius for event/perk targeting
 * @returns {number} maxTargetRadius - Alias for maxTargetRadiusMiles (spec wording)
 * @returns {string} analyticsLevel - 'basic' | 'full' | 'advanced'
 * @returns {boolean} canCreateAnnouncement - Included for forward compat (defaults false)
 * @returns {boolean} interestsMustBelongToSelectedCategories - Interests constrained to categories
 */
export function getBusinessCapabilities(tier) {
  switch (tier) {
    case BUSINESS_TIERS.TIER_1_FREE:
      return {
        monthlyEventLimit: 2,
        monthlyPerkLimit: 0,
        monthlyPostLimit: 2,
        maxActiveEvents: 1,
        maxActivePerks: 0,
        canCreatePerk: false,
        canCreateAnnouncement: false,
        interestSlots: 2,
        categorySlots: 0,
        maxTargetRadiusMiles: 3,
        maxTargetRadius: 3,
        analyticsLevel: ANALYTICS_LEVELS.BASIC,
        interestsMustBelongToSelectedCategories: false,
      };

    case BUSINESS_TIERS.TIER_2_GROWTH:
      return {
        monthlyEventLimit: 5,
        monthlyPerkLimit: 5,
        monthlyPostLimit: 5,
        maxActiveEvents: 3,
        maxActivePerks: 2,
        canCreatePerk: true,
        canCreateAnnouncement: false,
        interestSlots: 10,
        categorySlots: 1,
        maxTargetRadiusMiles: 8,
        maxTargetRadius: 8,
        analyticsLevel: ANALYTICS_LEVELS.FULL,
        interestsMustBelongToSelectedCategories: false,
      };

    case BUSINESS_TIERS.TIER_3_LANDMARK:
      return {
        monthlyEventLimit: Infinity,
        monthlyPerkLimit: Infinity,
        monthlyPostLimit: Infinity,
        maxActiveEvents: 10,
        maxActivePerks: 10,
        canCreatePerk: true,
        canCreateAnnouncement: true,
        interestSlots: Infinity,
        categorySlots: 3,
        maxTargetRadiusMiles: 25,
        maxTargetRadius: 25,
        analyticsLevel: ANALYTICS_LEVELS.ADVANCED,
        interestsMustBelongToSelectedCategories: true, // Interests must belong to selected categories
      };

    case BUSINESS_TIERS.TIER_4_ENTERPRISE:
      return {
        monthlyEventLimit: Infinity,
        monthlyPerkLimit: Infinity,
        monthlyPostLimit: Infinity,
        maxActiveEvents: Infinity,
        maxActivePerks: Infinity,
        canCreatePerk: true,
        canCreateAnnouncement: true,
        interestSlots: Infinity,
        categorySlots: Infinity,
        maxTargetRadiusMiles: 100, // Regional/multi-city
        maxTargetRadius: 100,
        analyticsLevel: ANALYTICS_LEVELS.ADVANCED,
        interestsMustBelongToSelectedCategories: true,
      };

    default:
      // Fallback to free tier if unknown
      console.warn(`Unknown business tier: ${tier}, defaulting to TIER_1_FREE`);
      return getBusinessCapabilities(BUSINESS_TIERS.TIER_1_FREE);
  }
}

/**
 * Helper: Check if tier allows perk creation
 * @param {string} tier
 * @returns {boolean}
 */
export function canCreatePerks(tier) {
  return getBusinessCapabilities(tier).canCreatePerk;
}

/**
 * Helper: Get readable tier name for UI display
 * @param {string} tier
 * @returns {string}
 */
export function getTierDisplayName(tier) {
  switch (tier) {
    case BUSINESS_TIERS.TIER_1_FREE:
      return 'Free';
    case BUSINESS_TIERS.TIER_2_GROWTH:
      return 'Growth';
    case BUSINESS_TIERS.TIER_3_LANDMARK:
      return 'Landmark';
    case BUSINESS_TIERS.TIER_4_ENTERPRISE:
      return 'Enterprise';
    default:
      return 'Unknown';
  }
}
