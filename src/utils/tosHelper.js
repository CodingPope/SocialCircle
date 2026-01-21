// Description: Helper utilities for Terms of Service (TOS) compliance checks
// Used to enforce Apple Guideline 1.2 - block UGC features if TOS not accepted

/**
 * Check if user has accepted TOS
 * @param {Object} user - User object from Firestore
 * @returns {boolean} - True if user accepted TOS
 */
export function hasTOSAccepted(user) {
  return user?.tosAccepted === true;
}

/**
 * Check if user can create user-generated content (UGC)
 * Requires TOS acceptance for: creating events, joining events, chatting, posting
 *
 * @param {Object} user - User object from Firestore
 * @returns {boolean} - True if user can create UGC
 */
export function canCreateUGC(user) {
  return hasTOSAccepted(user);
}

/**
 * Get user-friendly message explaining why UGC is blocked
 * @param {string} action - Action being blocked (e.g., 'create event', 'join event', 'send message')
 * @returns {string} - Message to show user
 */
export function getTOSBlockedMessage(action = 'perform this action') {
  return `To ${action}, you need to accept our Terms of Service. You can update this in Settings → Privacy & Legal → Terms of Service.`;
}

/**
 * Check if user can create events
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function canCreateEvent(user) {
  return canCreateUGC(user);
}

/**
 * Check if user can join events
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function canJoinEvent(user) {
  return canCreateUGC(user);
}

/**
 * Check if user can send chat messages
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function canSendMessage(user) {
  return canCreateUGC(user);
}

/**
 * Check if user can RSVP to events
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function canRSVP(user) {
  return canCreateUGC(user);
}

/**
 * Show alert when TOS blocks an action
 * @param {string} action - Action being blocked
 */
export function showTOSRequiredAlert(action = 'perform this action') {
  const message = getTOSBlockedMessage(action);
  alert(message);
}
