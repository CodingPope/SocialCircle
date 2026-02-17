// Description: Utility to determine which onboarding step to route to based on user profile
// Modular and scalable: add/remove steps as needed
export function getNextOnboardingStep(userData) {
  // Name step (required); DOB is optional per Apple Guideline 5.1.1
  // Show NameDob screen if name is missing OR if user was never prompted for DOB
  // Description: Apple users may have empty lastName (Apple doesn't always provide it);
  // skip name check if firstName is present and user has Apple markers
  const isAppleUser =
    userData.appleRelayEmail !== undefined ||
    userData.appleAuthorizationCode !== undefined ||
    userData.authProvider === 'apple';
  if (!userData.firstName) {
    return 'NameDob';
  }
  if (!isAppleUser && !userData.lastName) {
    return 'NameDob';
  }
  if (!userData.dob && !userData.dobPromptedAt) {
    return 'NameDob';
  }
  // Sex step — optional per Apple Guideline 5.1.1(ii)
  // Only show if user has never been prompted (sexPromptedAt is missing)
  if (!userData.sex && !userData.sexPromptedAt) {
    return 'Sex';
  }
  // TOS acceptance step (Guideline 1.2 compliance)
  // Only show if user has never been prompted (tosPromptedAt is missing)
  if (!userData.tosPromptedAt) {
    return 'TOS';
  }
  // Interests step
  if (!Array.isArray(userData.interests) || userData.interests.length === 0) {
    return 'InterestsScreen';
  }
  // Description: Location removed from onboarding per Apple Guideline 5.1.5
  // Location permission is now requested contextually on the Map screen (SC-103/SC-104)
  // All steps complete
  return null;
}
