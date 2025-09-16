// Description: User snippet cache with per-entry expiry used by tests.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

const useBase = (set, get) => ({
  cache: {}, // uid -> { data, expiresAt }
  ttlMs: DEFAULT_TTL,
  upsertSnippet: (snippet) => {
    if (!snippet?.uid) return;
    set((state) => ({
      cache: {
        ...state.cache,
        [snippet.uid]: {
          data: snippet,
          expiresAt: Date.now() + (state.ttlMs || DEFAULT_TTL),
        },
      },
    }));
  },
  getSnippet: (uid) => {
    const entry = get().cache[uid];
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) return null;
    return entry.data;
  },
});

export const useUserSnippetStore = create(
  persist(useBase, {
    name: 'userSnippetStore',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ cache: s.cache, ttlMs: s.ttlMs }),
    onRehydrateStorage: () => (state) => {
      if (!state) return;
      try {
        const now = Date.now();
        const cleaned = {};
        for (const [k, v] of Object.entries(state.cache || {})) {
          if (v && typeof v === 'object' && v.expiresAt > now) cleaned[k] = v;
        }
        state.cache = cleaned;
      } catch {}
    },
  })
);
