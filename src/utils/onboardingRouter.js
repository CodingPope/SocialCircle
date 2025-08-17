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
  // Interests step
  if (!Array.isArray(userData.interests) || userData.interests.length === 0) {
    return 'InterestsScreen';
  }
  // Location step (optional, remove if not needed)
  if (
    !userData.location ||
    userData.location.latitude == null ||
    userData.location.longitude == null
  ) {
    return 'Location';
  }
  // All steps complete
  return null;
}
