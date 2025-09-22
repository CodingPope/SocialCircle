// Description: Zustand store for user authentication and profile
import { create } from 'zustand';
import { auth, db, getUserData, updateUserData } from '../../../firebase/config';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { findSoftDeletedUserByEmail, reactivateUser } from '../services/userService';
import { navigationRef, resetRoot } from '../../../navigation/RootNavigation';
import { getNextOnboardingStep } from '../../../utils/onboardingRouter';

export const useUserStore = create((set) => ({
  // Current user object
  user: null,
  // Loading state for async actions
  loading: true,

  // Set user object
  setUser: (user) => set({ user }),
  // Set loading state
  setLoading: (loading) => set({ loading }),
  setProfileComplete: (complete) => set({ profileComplete: complete }), // <-- Add this line

  // Login action
  login: async (email, password) => {
    set({ loading: true });
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      try {
        await enableNetwork(db);
      } catch {}
      const userData = await getUserData(result.user.uid);
      // Restrict login for soft-deleted users
      if (userData && userData.isDeleted) {
        await signOut(auth);
        set({ user: null, loading: false });
        if (typeof global !== 'undefined' && global.Alert) {
          global.Alert.alert(
            'Account Deleted',
            'Your account has been deleted. Please contact support if you believe this is a mistake.'
          );
        }
        throw new Error(
          'Your account has been deleted. Please contact support if you believe this is a mistake.'
        );
      }
      set({
        user: { uid: result.user.uid, email: result.user.email, ...userData },
        loading: false,
      });
      return true;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  // Signup action with soft-deleted user reactivation
  signup: async (email, password, userData = {}, navigation) => {
    set({ loading: true });
    try {
      // Check for soft-deleted user with this email
      const softDeleted = await findSoftDeletedUserByEmail(email);
      if (softDeleted) {
        // Offer to reactivate
        if (typeof global !== 'undefined' && global.Alert) {
          global.Alert.alert(
            'Reactivate Account',
            'An account with this email was previously deleted. Would you like to reactivate it and restore your previous data?',
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => set({ loading: false }),
              },
              {
                text: 'Reactivate',
                style: 'default',
                onPress: async () => {
                  await reactivateUser(softDeleted.id, {
                    ...userData,
                  });
                  // Optionally, update password in Auth if needed (not handled here)
                  set({ loading: false });
                  if (navigation) navigation.replace('Login');
                  if (typeof global !== 'undefined' && global.Alert) {
                    global.Alert.alert(
                      'Account Reactivated',
                      'Your account has been reactivated. Please log in.'
                    );
                  }
                },
              },
              {
                text: 'Start Fresh',
                style: 'destructive',
                onPress: async () => {
                  // Optionally, create a new user document (with new UID if possible)
                  set({ loading: false });
                  if (navigation) navigation.replace('Signup');
                },
              },
            ]
          );
        }
        return;
      }
      // ...existing signup logic (create user in Auth and Firestore)
      set({ loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  // Logout action (only handles auth, navigation handled in screen)
  logout: async () => {
    set({ loading: true });
    try {
      // Pause Firestore network first to prevent transient permission-denied callbacks
      try {
        await disableNetwork(db);
      } catch {}

      // Clean up any globally tracked Firestore listeners
      if (
        global.unsubscribeAllListeners &&
        Array.isArray(global.unsubscribeAllListeners)
      ) {
        try {
          global.unsubscribeAllListeners.forEach((unsub) => {
            try {
              typeof unsub === 'function' && unsub();
            } catch {}
          });
        } catch {}
        global.unsubscribeAllListeners = [];
      }

      await signOut(auth);
      set({ user: null, profileComplete: false, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  // Fetch user profile from Firestore
  fetchUser: async (uid) => {
    set({ loading: true });
    try {
      const userData = await getUserData(uid);
      // Restrict access for soft-deleted users
      if (userData && userData.isDeleted) {
        set({ user: null, loading: false });
        return;
      }
      set({ user: { uid, ...userData }, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
  // --- Future: Account recovery and GDPR hard delete can be implemented here ---

  // Update user profile in Firestore
  updateProfile: async (uid, data) => {
    set({ loading: true });
    try {
      await updateUserData(uid, data);
      const userData = await getUserData(uid);
      set({ user: { uid, ...userData }, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  // Listen to auth state changes (for auto-login)
  listenAuthState: () => {
    set({ loading: true });
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await enableNetwork(db);
        } catch {}
        const userData = await getUserData(firebaseUser.uid);
        set({
          user: {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            ...userData,
          },
          loading: false,
        });
        const complete = getNextOnboardingStep(userData) === null;
        set({ profileComplete: complete });
      } else {
        set({ user: null, loading: false, profileComplete: false });
        // Do not reset navigation here; AppNavigator will render AuthStack when user is null
      }
    });
  },
}));
