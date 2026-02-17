// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../../../services/firebase';
import {
  init as analyticsInit,
  setOptIn as analyticsSetOptIn,
} from '../../../services/analyticsService';
import { useSessionRole } from '../../profile/stores/sessionRoleStore';

const AuthContext = createContext({ user: null, loading: true });
if (!global.unsubscribeAllListeners) {
  global.unsubscribeAllListeners = [];
}
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionRoleStore = useSessionRole;

  useEffect(() => {
    let unsubscribeDoc = null; // Track the Firestore listener

    const unsubscribeAuth = auth().onAuthStateChanged((firebaseUser) => {
      // ✅ Stop any previous Firestore listener before attaching a new one
      if (unsubscribeDoc) {
        try {
          unsubscribeDoc();
        } catch {}
        unsubscribeDoc = null;
      }

      if (!firebaseUser) {
        // Disable analytics when no user
        try {
          analyticsSetOptIn(false);
        } catch {}
        setUser(null);
        setLoading(false);
        // Reset business session role when user logs out
        try {
          sessionRoleStore.getState().reset();
        } catch {}
        return;
      }

      // ✅ Start a new Firestore listener for the logged-in user
      const userDoc = db.collection('users').doc(firebaseUser.uid);
      unsubscribeDoc = userDoc.onSnapshot(
        async (snapshot) => {
          const data = snapshot.data() || {};
          // If the doc is soft-deleted, treat as no user (triggers AuthStack)
          if (data.isDeleted) {
            setUser(null);
            setLoading(false);
            try { sessionRoleStore.getState().reset(); } catch {}
            return;
          }
          const next = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            ...data,
          };
          setUser(next);
          try {
            sessionRoleStore
              .getState()
              .setRole(
                String(data.type || '').toLowerCase() === 'business'
                  ? 'business'
                  : 'consumer'
              );
          } catch {}
          setLoading(false);
          // Initialize analytics with tracking off here; App.js will re-enable
          // based on user preference + ATT gate to avoid accidental tracking.
          try {
            await analyticsInit({ ...next, analyticsOptIn: false });
          } catch {}
        },
        (err) => {
          if (err?.code === 'permission-denied') {
            const next = { uid: firebaseUser.uid, email: firebaseUser.email };
            setUser(next);
            try {
              sessionRoleStore.getState().setRole('consumer');
            } catch {}
            setLoading(false);
            try {
              analyticsInit({ ...next, analyticsOptIn: false });
            } catch {}
            try {
              unsubscribeDoc && unsubscribeDoc();
            } catch {}
            return;
          }
          console.error('Failed to read user profile', err);
          const next = { uid: firebaseUser.uid, email: firebaseUser.email };
          setUser(next);
          setLoading(false);
          try {
            analyticsInit({ ...next, analyticsOptIn: false });
          } catch {}
        }
      );

      // Track globally so logout can proactively stop it
      try {
        if (!global.unsubscribeAllListeners)
          global.unsubscribeAllListeners = [];
        global.unsubscribeAllListeners.push(unsubscribeDoc);
      } catch {}
    });

    // ✅ Cleanup when the component unmounts
    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc)
        try {
          unsubscribeDoc();
        } catch {}
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
