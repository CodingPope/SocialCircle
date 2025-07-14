// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) Listen for Firebase auth changes
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // 2) If logged in, subscribe to their Firestore profile doc
      const userDoc = doc(db, 'users', firebaseUser.uid);
      const unsubscribeDoc = onSnapshot(
        userDoc,
        (snapshot) => {
          const data = snapshot.data() || {};
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            ...data,
          });
          setLoading(false);
        },
        (err) => {
          console.error('Failed to read user profile', err);
          // fallback so the app at least unblocks
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
          setLoading(false);
        }
      );

      // tear down the snapshot listener when auth‐changes again
      return unsubscribeDoc;
    });

    // clean up
    return unsubscribeAuth;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
