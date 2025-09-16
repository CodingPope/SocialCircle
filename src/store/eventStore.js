// Description: Minimal event store with persistence + TTL logic to satisfy tests.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

const useBase = (set, get) => ({
  events: [],
  lastFetchedAt: 0,
  needsRefresh: false,
  ttlMs: DEFAULT_TTL,
  rsvpEvent: async (eventId, uid) => {
    set((state) => ({
      events: state.events.map((e) =>
        e.id === eventId
          ? { ...e, attendees: [...(e.attendees || []), uid] }
          : e
      ),
    }));
  },
  joinWaitlist: async (eventId, uid) => {
    set((state) => ({
      events: state.events.map((e) =>
        e.id === eventId ? { ...e, waitlist: [...(e.waitlist || []), uid] } : e
      ),
    }));
  },
  setEvents: (events) =>
    set({ events, lastFetchedAt: Date.now(), needsRefresh: false }),
});

export const useEventStore = create(
  persist(useBase, {
    name: 'eventStore',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      events: state.events,
      lastFetchedAt: state.lastFetchedAt,
      ttlMs: state.ttlMs,
    }),
    onRehydrateStorage: () => (state) => {
      if (!state) return;
      try {
        const { lastFetchedAt, ttlMs } = state;
        if (!lastFetchedAt) {
          state.needsRefresh = true;
          return;
        }
        if (Date.now() - lastFetchedAt > (state.ttlMs || DEFAULT_TTL)) {
          // stale
          state.events = [];
          state.needsRefresh = true;
        }
      } catch {}
    },
  })
);
