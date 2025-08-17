// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext({ user: null, loading: true });
if (!global.unsubscribeAllListeners) {
  global.unsubscribeAllListeners = [];
}
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc = null; // Track the Firestore listener

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // ✅ Stop any previous Firestore listener before attaching a new one
      if (unsubscribeDoc) {
        try {
          unsubscribeDoc();
        } catch {}
        unsubscribeDoc = null;
      }

      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // ✅ Start a new Firestore listener for the logged-in user
      const userDoc = doc(db, 'users', firebaseUser.uid);
      unsubscribeDoc = onSnapshot(
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
          if (err?.code === 'permission-denied') {
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
            setLoading(false);
            try {
              unsubscribeDoc && unsubscribeDoc();
            } catch {}
            return;
          }
          console.error('Failed to read user profile', err);
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
          setLoading(false);
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
