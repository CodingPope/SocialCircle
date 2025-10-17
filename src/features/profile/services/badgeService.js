// Description: Badge management service for awarding, removing, and managing user badges

import { db, arrayUnion, arrayRemove } from '../../../firebase/config';
import { getBadgeConfig, badgeExists, DEFAULT_BADGE } from './badgeConfig';

/**
 * Award a badge to a user
 * @param {string} userId - The user's ID
 * @param {string} badgeId - The badge ID to award
 * @param {boolean} setAsCurrent - Whether to set this badge as the current displayed badge
 * @returns {Promise<boolean>} - Success status
 */
export async function awardBadge(userId, badgeId, setAsCurrent = false) {
  try {
    if (!badgeExists(badgeId)) {
      console.warn(`[badgeService] Badge ${badgeId} does not exist`);
      return false;
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`[badgeService] User ${userId} does not exist`);
      return false;
    }

    const userData = userDoc.data();
    const currentBadges = userData.badges || [];

    // Check if user already has this badge
    if (currentBadges.includes(badgeId)) {
      console.log(`[badgeService] User ${userId} already has badge ${badgeId}`);
      return true;
    }

    const updateData = {
      badges: arrayUnion(badgeId),
    };

    // Set as current badge if requested or if user has no current badge
    if (setAsCurrent || !userData.currentBadge) {
      updateData.currentBadge = badgeId;
    }

    await userRef.update(updateData);
    console.log(
      `[badgeService] Successfully awarded badge ${badgeId} to user ${userId}`
    );
    return true;
  } catch (error) {
    console.error(
      `[badgeService] Error awarding badge ${badgeId} to user ${userId}:`,
      error
    );
    return false;
  }
}

/**
 * Remove a badge from a user
 * @param {string} userId - The user's ID
 * @param {string} badgeId - The badge ID to remove
 * @returns {Promise<boolean>} - Success status
 */
export async function removeBadge(userId, badgeId) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`[badgeService] User ${userId} does not exist`);
      return false;
    }

    const userData = userDoc.data();
    const currentBadges = userData.badges || [];

    if (!currentBadges.includes(badgeId)) {
      console.log(
        `[badgeService] User ${userId} does not have badge ${badgeId}`
      );
      return true;
    }

    const updateData = {
      badges: arrayRemove(badgeId),
    };

    // If removing the current badge, set to default or first available badge
    if (userData.currentBadge === badgeId) {
      const remainingBadges = currentBadges.filter((b) => b !== badgeId);
      updateData.currentBadge =
        remainingBadges.length > 0 ? remainingBadges[0] : DEFAULT_BADGE;
    }

    await userRef.update(updateData);
    console.log(
      `[badgeService] Successfully removed badge ${badgeId} from user ${userId}`
    );
    return true;
  } catch (error) {
    console.error(
      `[badgeService] Error removing badge ${badgeId} from user ${userId}:`,
      error
    );
    return false;
  }
}

/**
 * Change a user's current displayed badge
 * @param {string} userId - The user's ID
 * @param {string} badgeId - The badge ID to set as current
 * @returns {Promise<boolean>} - Success status
 */
export async function setCurrentBadge(userId, badgeId) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`[badgeService] User ${userId} does not exist`);
      return false;
    }

    const userData = userDoc.data();
    const userBadges = userData.badges || [];

    // Check if user has this badge
    if (!userBadges.includes(badgeId)) {
      console.warn(
        `[badgeService] User ${userId} does not have badge ${badgeId}`
      );
      return false;
    }

    await userRef.update({
      currentBadge: badgeId,
    });

    console.log(
      `[badgeService] Successfully set current badge to ${badgeId} for user ${userId}`
    );
    return true;
  } catch (error) {
    console.error(
      `[badgeService] Error setting current badge for user ${userId}:`,
      error
    );
    return false;
  }
}

/**
 * Get all badges for a user with their configurations
 * @param {string} userId - The user's ID
 * @returns {Promise<Array>} - Array of badge configurations
 */
export async function getUserBadges(userId) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`[badgeService] User ${userId} does not exist`);
      return [];
    }

    const userData = userDoc.data();
    const userBadgeIds = userData.badges || [];

    return userBadgeIds.map((badgeId) => ({
      ...getBadgeConfig(badgeId),
      isCurrent: userData.currentBadge === badgeId,
    }));
  } catch (error) {
    console.error(
      `[badgeService] Error getting badges for user ${userId}:`,
      error
    );
    return [];
  }
}
