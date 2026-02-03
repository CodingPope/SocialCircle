// Description: Shared tier helpers for backend capability checks.

const USER_TIERS = Object.freeze({
  BASIC: 'basic',
  PAID: 'paid',
  POPULAR: 'popular',
});

const BUSINESS_TIERS = Object.freeze({
  TIER_1_FREE: 'TIER_1_FREE',
  TIER_2_GROWTH: 'TIER_2_GROWTH',
  TIER_3_LANDMARK: 'TIER_3_LANDMARK',
  TIER_4_ENTERPRISE: 'TIER_4_ENTERPRISE',
});

const BUSINESS_TIER_LABELS = Object.freeze({
  [BUSINESS_TIERS.TIER_1_FREE]: 'Free',
  [BUSINESS_TIERS.TIER_2_GROWTH]: 'Growth',
  [BUSINESS_TIERS.TIER_3_LANDMARK]: 'Landmark',
  [BUSINESS_TIERS.TIER_4_ENTERPRISE]: 'Enterprise',
});

const USER_TIER_RANK = Object.freeze({
  [USER_TIERS.BASIC]: 1,
  [USER_TIERS.PAID]: 2,
  [USER_TIERS.POPULAR]: 3,
});

const BUSINESS_TIER_RANK = Object.freeze({
  [BUSINESS_TIERS.TIER_1_FREE]: 1,
  [BUSINESS_TIERS.TIER_2_GROWTH]: 2,
  [BUSINESS_TIERS.TIER_3_LANDMARK]: 3,
  [BUSINESS_TIERS.TIER_4_ENTERPRISE]: 4,
});

function normalizeUserTier(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (raw === USER_TIERS.BASIC || raw === 'free') return USER_TIERS.BASIC;
  if (raw === USER_TIERS.PAID || raw === 'premium' || raw === 'pro')
    return USER_TIERS.PAID;
  if (raw === USER_TIERS.POPULAR) return USER_TIERS.POPULAR;
  return null;
}

function normalizeBusinessTier(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  // Accept exact matches
  if (raw === BUSINESS_TIERS.TIER_1_FREE) return BUSINESS_TIERS.TIER_1_FREE;
  if (raw === BUSINESS_TIERS.TIER_2_GROWTH) return BUSINESS_TIERS.TIER_2_GROWTH;
  if (raw === BUSINESS_TIERS.TIER_3_LANDMARK)
    return BUSINESS_TIERS.TIER_3_LANDMARK;
  if (raw === BUSINESS_TIERS.TIER_4_ENTERPRISE)
    return BUSINESS_TIERS.TIER_4_ENTERPRISE;
  // Accept legacy/alternate formats
  const lower = raw.toLowerCase();
  if (
    lower === 'tier1' ||
    lower === '1' ||
    lower === 'free' ||
    lower === 'base'
  )
    return BUSINESS_TIERS.TIER_1_FREE;
  if (lower === 'tier2' || lower === '2' || lower === 'growth')
    return BUSINESS_TIERS.TIER_2_GROWTH;
  if (lower === 'tier3' || lower === '3' || lower === 'landmark')
    return BUSINESS_TIERS.TIER_3_LANDMARK;
  if (lower === 'tier4' || lower === '4' || lower === 'enterprise')
    return BUSINESS_TIERS.TIER_4_ENTERPRISE;
  return null;
}

function deriveUserTier(user = {}) {
  if (user.isPopular === true) return USER_TIERS.POPULAR;

  const normalizedPremiumTier = normalizeUserTier(user.premiumTier);
  if (user.premiumActive === true || normalizedPremiumTier === USER_TIERS.PAID)
    return USER_TIERS.PAID;

  const explicit = normalizeUserTier(user.plan || user.premiumTier);
  return explicit || USER_TIERS.BASIC;
}

function deriveBusinessTier(business = {}) {
  const explicit = normalizeBusinessTier(
    business.tier || business.businessTier || business.plan,
  );
  return explicit || BUSINESS_TIERS.TIER_1_FREE;
}

function hasUserTier(user, requiredTier) {
  const actual = deriveUserTier(user);
  const required = normalizeUserTier(requiredTier) || USER_TIERS.BASIC;
  return (USER_TIER_RANK[actual] || 0) >= (USER_TIER_RANK[required] || 0);
}

function hasBusinessTier(business, requiredTier) {
  const actual = deriveBusinessTier(business);
  const required =
    normalizeBusinessTier(requiredTier) || BUSINESS_TIERS.TIER_1_FREE;
  return (
    (BUSINESS_TIER_RANK[actual] || 0) >= (BUSINESS_TIER_RANK[required] || 0)
  );
}

/**
 * Get business capability limits based on tier
 * Matches client-side businessCapabilities.js
 */
function getBusinessCapabilities(tier) {
  const normalized = normalizeBusinessTier(tier) || BUSINESS_TIERS.TIER_1_FREE;

  switch (normalized) {
    case BUSINESS_TIERS.TIER_1_FREE:
      return {
        monthlyEventLimit: 2,
        monthlyPerkLimit: 0,
        maxActiveEvents: 1,
        maxActivePerks: 0,
        canCreatePerk: false,
        interestSlots: 2,
        categorySlots: 0,
        maxTargetRadiusMiles: 3,
        analyticsLevel: 'basic',
        interestsMustBelongToSelectedCategories: false,
      };

    case BUSINESS_TIERS.TIER_2_GROWTH:
      return {
        monthlyEventLimit: 5,
        monthlyPerkLimit: 5,
        maxActiveEvents: 3,
        maxActivePerks: 2,
        canCreatePerk: true,
        interestSlots: 10,
        categorySlots: 1,
        maxTargetRadiusMiles: 8,
        analyticsLevel: 'full',
        interestsMustBelongToSelectedCategories: false,
      };

    case BUSINESS_TIERS.TIER_3_LANDMARK:
      return {
        monthlyEventLimit: Infinity,
        monthlyPerkLimit: Infinity,
        maxActiveEvents: 10,
        maxActivePerks: 10,
        canCreatePerk: true,
        interestSlots: Infinity,
        categorySlots: 3,
        maxTargetRadiusMiles: 25,
        analyticsLevel: 'advanced',
        interestsMustBelongToSelectedCategories: true,
      };

    case BUSINESS_TIERS.TIER_4_ENTERPRISE:
      return {
        monthlyEventLimit: Infinity,
        monthlyPerkLimit: Infinity,
        maxActiveEvents: Infinity,
        maxActivePerks: Infinity,
        canCreatePerk: true,
        interestSlots: Infinity,
        categorySlots: Infinity,
        maxTargetRadiusMiles: 100,
        analyticsLevel: 'advanced',
        interestsMustBelongToSelectedCategories: true,
      };

    default:
      return getBusinessCapabilities(BUSINESS_TIERS.TIER_1_FREE);
  }
}

module.exports = {
  USER_TIERS,
  BUSINESS_TIERS,
  BUSINESS_TIER_LABELS,
  USER_TIER_RANK,
  BUSINESS_TIER_RANK,
  normalizeUserTier,
  normalizeBusinessTier,
  deriveUserTier,
  deriveBusinessTier,
  hasUserTier,
  hasBusinessTier,
  getBusinessCapabilities,
};
