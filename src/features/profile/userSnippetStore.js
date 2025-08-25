// Description: Cached user snippet store with AsyncStorage persistence and TTL.
// Provides batched fetch via Firestore 'in' queries and dedupes reads across screens.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../firebase/config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

// Build a minimal snippet from a user doc
function toSnippet(uid, user) {
  const first = (user?.firstName || '').toString().trim();
  const last = (user?.lastName || '').toString().trim();
  const name =
    `${first} ${last}`.trim() || user?.displayName || user?.username || 'User';
  const photoURL =
    user?.profileImage || user?.avatarURL || user?.photoURL || null;
  const verified = !!user?.verified;
  const rating =
    typeof user?.rating === 'number'
      ? user.rating
      : typeof user?.ranking === 'number'
      ? user.ranking
      : null;
  return { uid, name, photoURL, verified, rating };
}

export const useUserSnippetStore = create(
  persist(
    (set, get) => ({
      // TTL for cache entries
      ttlMs: 24 * 60 * 60 * 1000, // 24h
      // cache: { [uid]: { data: snippet, expiresAt: number } }
      cache: {},
      // Track ongoing fetches by uid to dedupe
      inflight: {}, // { [uid]: Promise<snippet|null> }

      // Put many snippets into cache with TTL
      putMany: (snippets) => {
        if (!Array.isArray(snippets) || !snippets.length) return;
        const now = Date.now();
        const ttl = get().ttlMs;
        const next = { ...get().cache };
        for (const s of snippets) {
          if (!s || !s.uid) continue;
          next[s.uid] = { data: s, expiresAt: now + ttl };
        }
        set({ cache: next });
      },

      // Get valid cached snippets for uids
      getMany: (uids) => {
        const out = new Map();
        const cache = get().cache;
        const now = Date.now();
        for (const uid of uids || []) {
          const entry = cache?.[uid];
          if (entry && entry.expiresAt > now && entry.data)
            out.set(uid, entry.data);
        }
        return out;
      },

      // Ensure snippets for uids; fetches missing in batched 'in' queries and updates cache
      ensureSnippets: async (uids) => {
        const ids = Array.from(new Set((uids || []).filter(Boolean)));
        if (!ids.length) return new Map();

        const cached = get().getMany(ids);
        const missing = ids.filter((u) => !cached.has(u));

        const fetched = [];
        // Batch in chunks of 10 for Firestore 'in' queries
        for (let i = 0; i < missing.length; i += 10) {
          const chunk = missing.slice(i, i + 10);
          if (!chunk.length) continue;
          try {
            const q = query(
              collection(db, 'users'),
              where('__name__', 'in', chunk)
            );
            const snap = await getDocs(q);
            snap.docs.forEach((d) => {
              const s = toSnippet(d.id, d.data());
              fetched.push(s);
            });
          } catch (e) {
            // Fallback to individual gets for resiliency
            const results = await Promise.all(
              chunk.map(async (uid) => {
                try {
                  const s = await getDoc(doc(db, 'users', uid));
                  return s.exists()
                    ? toSnippet(uid, s.data())
                    : {
                        uid,
                        name: 'User',
                        photoURL: null,
                        verified: false,
                        rating: null,
                      };
                } catch {
                  return {
                    uid,
                    name: 'User',
                    photoURL: null,
                    verified: false,
                    rating: null,
                  };
                }
              })
            );
            fetched.push(...results);
          }
        }

        // Update cache
        get().putMany(fetched);

        // Merge cached + fetched into a single Map
        const finalMap = new Map(cached);
        for (const s of fetched) finalMap.set(s.uid, s);
        return finalMap;
      },
    }),
    {
      name: 'user-snippet-cache',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ cache: state.cache, ttlMs: state.ttlMs }),
      migrate: async (persistedState, version) => {
        // Keep backward compatibility; just return as-is
        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        try {
          // Drop stale entries on rehydrate
          const now = Date.now();
          const ttl = state?.ttlMs || 24 * 60 * 60 * 1000;
          const cache = state?.cache || {};
          const next = {};
          for (const uid in cache) {
            const entry = cache[uid];
            if (
              entry &&
              entry.data &&
              typeof entry.expiresAt === 'number' &&
              entry.expiresAt > now
            ) {
              next[uid] = entry;
            }
          }
          useUserSnippetStore.setState({ cache: next });
        } catch {}
      },
    }
  )
);

export default useUserSnippetStore;
