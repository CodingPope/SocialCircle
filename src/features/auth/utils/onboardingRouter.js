// Description: Utility to determine which onboarding step to route to based on user profile
// Modular and scalable: add/remove steps as needed
export function getNextOnboardingStep(userData) {
  // Name/DOB step
  if (!userData.firstName || !userData.lastName || !userData.dob) {
    return 'NameDob';
  }
  // Sex step
  if (!userData.sex) {
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
  // Location step (optional - users can skip per Apple Guideline 5.1.5)
  // Only show if user has never been prompted for location
  if (!userData.locationPromptedAt) {
    return 'Location';
  }
  // All steps complete
  return null;
}
