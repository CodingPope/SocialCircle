// src/lib/userProfile.js
import { serverTimestamp } from 'firebase/firestore';

// canonical options
const ALLOWED = ['male', 'female', 'nonbinary', 'other'];

export function normalizeSex(value) {
  const v = (value ?? '').toString().trim().toLowerCase();
  if (['m', 'male'].includes(v)) return 'male';
  if (['f', 'female'].includes(v)) return 'female';
  if (['nb', 'non-binary', 'nonbinary'].includes(v)) return 'nonbinary';
  if (v === 'other') return 'other';
  return null; // not set
}

export function nonEmptyOrNull(s) {
  return typeof s === 'string' && s.trim().length ? s.trim() : null;
}

/**
 * Build a safe initial user profile. NO empty strings, only nulls or valid values.
 * Pass anything you collected on first screen: { firstName, lastName, sex, deviceToken }.
 */
export function buildInitialUserDoc({ uid, email, raw = {} }) {
  const {
    firstName,
    lastName,
    sex, // keep your current field name to avoid breaking screens
    bio,
    profileImage,
    deviceToken, // may not exist yet; we won't write '' ever
  } = raw;

  const normalizedSex = normalizeSex(sex);

  const safeToken =
    typeof deviceToken === 'string' && deviceToken.trim().length
      ? deviceToken.trim()
      : null;

  return {
    uid,
    email: email ?? null,
    firstName: nonEmptyOrNull(firstName),
    lastName: nonEmptyOrNull(lastName),
    bio: nonEmptyOrNull(bio),
    profileImage: nonEmptyOrNull(profileImage),

    // keep ONE canonical field for your codebase; you currently use `sex`
    sex: ALLOWED.includes(normalizedSex) ? normalizedSex : null,

    // location set later
    location: { latitude: null, longitude: null },

    friends: [],
    interests: [],
    attendedEvents: [],
    createdEvents: [],
    followerCount: 0,
    followingCount: 0,
    following: [],
    ratings: {},
    rating: 0,
    ratingCount: 0,
    eventCount: 0,
    followCount: 0,
    savedCount: 0,
    blocked: [],
    blockedBy: [],

    referralCode: '',
    referredBy: '',

    status: 'active',
    verified: false,
    isDeleted: false,
    deletedAt: null,

    deviceToken: safeToken, // null or a REAL token
    pushOptIn: !!safeToken,

    lastActive: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}
