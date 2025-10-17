// Description: Hydrate Zustand user store from Firestore on app launch
import { db } from '../../../firebase/config';
import { useUserStore } from '../../profile';
import { getNextOnboardingStep } from '../utils/onboardingRouter';

// Description: Checks if user profile is complete for main app access
export function isProfileComplete(userData) {
  return getNextOnboardingStep(userData) === null;
}

// Description: Hydrate Zustand store and route to correct onboarding step if needed
export async function hydrateUserStore(uid, navigation) {
  // Responsive: Do not block UI, caller should show loading indicator if needed
  const userDocRef = db.collection('users').doc(uid);
  const userDoc = await userDocRef.get();
  if (userDoc.exists) {
    const userData = userDoc.data();
    useUserStore.getState().setUser({ uid, ...userData });
    const complete = isProfileComplete(userData);
    useUserStore.getState().setProfileComplete(complete);

    // Modular onboarding routing
    const nextStep = getNextOnboardingStep(userData);
    if (!complete && nextStep && navigation) {
      // Description: Route to correct onboarding step based on missing fields
      navigation.replace(nextStep);
    }
    // If complete, navigator will show main app automatically
  }
}
