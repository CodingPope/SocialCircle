import { create } from 'zustand';
import { auth, db } from '../../../services/firebase/config';
import { doc, getDoc, updateDoc } from '../../../services/firebase/firestoreCompat';

/**
 * Zustand store for managing user interests with Firestore integration.
 *
 * State:
 *   interests: Array of interest objects for the current user
 *   loading: Boolean indicating async operation status
 *
 * Actions:
 *   setInterests(interests): Set interests locally in state
 *   fetchInterests(): Fetch interests from Firestore for current user
 *   updateInterests(interests): Update interests in Firestore for current user
 *
 * Usage:
 *   const { interests, loading, fetchInterests, updateInterests } = useInterestStore();
 *   useEffect(() => { fetchInterests(); }, []);
 *   updateInterests(['hiking', 'music']);
 *
 * Contributors:
 *   - Always check for loading state before rendering dependent UI
 *   - Handle errors gracefully in UI (errors are logged to console)
 */
export const useInterestStore = create((set) => ({
  // List of interest objects for the current user
  interests: [],
  // Loading state for async actions
  loading: false,

  /**
   * Set interests locally in state
   * @param {Array} interests - Array of interest strings/objects
   */
  setInterests: (interests) => set({ interests }),

  /**
   * Fetch interests from Firestore for current user
   * Updates 'interests' state with Firestore data
   */
  fetchInterests: async () => {
    set({ loading: true });
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('No authenticated user found');
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists) {
        const userData = userDoc.data();
        set({ interests: userData.interests || [] });
      } else {
        set({ interests: [] });
      }
    } catch (error) {
      console.error('Error fetching user interests:', error);
      set({ interests: [] });
    }
    set({ loading: false });
  },

  /**
   * Update user interests in Firestore for current user
   * @param {Array} interests - Array of interest strings/objects
   * Updates Firestore and local state
   */
  updateInterests: async (interests) => {
    set({ loading: true });
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('No authenticated user found');
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { interests });
      set({ interests });
    } catch (error) {
      console.error('Error updating user interests:', error);
    }
    set({ loading: false });
  },
}));
