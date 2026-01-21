// Description: Shared tier helpers for backend capability checks.

const USER_TIERS = Object.freeze({
  BASIC: 'basic',
  PAID: 'paid',
  POPULAR: 'popular',
});

const BUSINESS_TIERS = Object.freeze({
  TIER1: 'tier1',
  TIER2: 'tier2',
  TIER3: 'tier3',
});

const BUSINESS_TIER_LABELS = Object.freeze({
  [BUSINESS_TIERS.TIER1]: 'base',
  [BUSINESS_TIERS.TIER2]: 'growth',
  [BUSINESS_TIERS.TIER3]: 'landmark',
});

const USER_TIER_RANK = Object.freeze({
  [USER_TIERS.BASIC]: 1,
  [USER_TIERS.PAID]: 2,
  [USER_TIERS.POPULAR]: 3,
});

const BUSINESS_TIER_RANK = Object.freeze({
  [BUSINESS_TIERS.TIER1]: 1,
  [BUSINESS_TIERS.TIER2]: 2,
  [BUSINESS_TIERS.TIER3]: 3,
});

function normalizeUserTier(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === USER_TIERS.BASIC || raw === 'free') return USER_TIERS.BASIC;
  if (raw === USER_TIERS.PAID || raw === 'premium' || raw === 'pro')
    return USER_TIERS.PAID;
  if (raw === USER_TIERS.POPULAR) return USER_TIERS.POPULAR;
  return null;
}

function normalizeBusinessTier(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === BUSINESS_TIERS.TIER1 || raw === '1' || raw === 'base')
    return BUSINESS_TIERS.TIER1;
  if (raw === BUSINESS_TIERS.TIER2 || raw === '2' || raw === 'growth')
    return BUSINESS_TIERS.TIER2;
  if (raw === BUSINESS_TIERS.TIER3 || raw === '3' || raw === 'landmark')
    return BUSINESS_TIERS.TIER3;
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
    business.businessTier || business.tier || business.plan
  );
  return explicit || BUSINESS_TIERS.TIER1;
}

function hasUserTier(user, requiredTier) {
  const actual = deriveUserTier(user);
  const required = normalizeUserTier(requiredTier) || USER_TIERS.BASIC;
  return (USER_TIER_RANK[actual] || 0) >= (USER_TIER_RANK[required] || 0);
}

function hasBusinessTier(business, requiredTier) {
  const actual = deriveBusinessTier(business);
  const required = normalizeBusinessTier(requiredTier) || BUSINESS_TIERS.TIER1;
  return (
    (BUSINESS_TIER_RANK[actual] || 0) >=
    (BUSINESS_TIER_RANK[required] || 0)
  );
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
};
