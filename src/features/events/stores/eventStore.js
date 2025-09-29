import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../../firebase/config';

// Description: Zustand store for events, RSVP, waitlist, and event creation
export const useEventStore = create(
  persist(
    (set, get) => ({
      // TTL for cached event lists (5 minutes)
      ttlMs: 5 * 60 * 1000,
      // List of event objects
      events: [],
      // When events were last fetched/updated
      lastFetchedAt: 0,
      // Whether the store thinks a refresh is needed (computed on rehydrate)
      needsRefresh: false,
      // Loading state for async actions (not persisted)
      loading: false,

      // Set events list and stamp fetch time
      setEvents: (events) =>
        set({
          events: Array.isArray(events) ? events : [],
          lastFetchedAt: Date.now(),
          needsRefresh: false,
        }),

      // Fetch events from Firestore
      fetchEvents: async () => {
        set({ loading: true });
        try {
          // TODO: Firestore query for events
          // ...
        } finally {
          set({ loading: false });
        }
      },

      // RSVP to an event
      rsvpEvent: async (eventId, userId) => {
        set({ loading: true });
        try {
          // Use regional Functions instance to ensure we call the correctly-deployed callable
          const { getFunctions, httpsCallable } = await import(
            'firebase/functions'
          );
          const { getApp } = await import('firebase/app');
          const functions = getFunctions(getApp(), 'us-central1');
          const rsvpCallable = httpsCallable(functions, 'rsvpEvent');
          const res = await rsvpCallable({ eventId, userId });
          const data = res.data || {};

          // Optimistic local update: add user to event.attendees in local store if present
          set((state) => ({
            events: state.events.map((ev) =>
              ev.id === eventId
                ? {
                    ...ev,
                    attendees: Array.isArray(ev.attendees)
                      ? Array.from(new Set([...ev.attendees, userId]))
                      : [userId],
                  }
                : ev
            ),
          }));

          // Optionally seed chatStore with chat metadata (caller can implement chatStore seed)
          try {
            const chatModule = await import('../../chat/stores/chatStore');
            if (chatModule && chatModule.useChatStore) {
              const useChatStore = chatModule.useChatStore;
              const addChat = useChatStore.getState().addChat;
              if (typeof addChat === 'function') {
                addChat({
                  id: data.chatId || eventId,
                  participants: data.participants || [],
                });
              }
            }
          } catch {}
        } catch (error) {
          console.error('RSVP failed:', error);
        } finally {
          set({ loading: false });
        }
      },

      // Join waitlist for a full event
      joinWaitlist: async (eventId, userId) => {
        // TODO: Firestore waitlist logic
        // ...
      },

      // Create a new event
      createEvent: async (eventData) => {
        // TODO: Firestore event creation logic
        // ...
      },

      // ...other event actions (e.g., update, delete)
    }),
    {
      name: 'event-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist data that is safe/needed offline
      partialize: (state) => ({
        events: state.events,
        lastFetchedAt: state.lastFetchedAt,
        ttlMs: state.ttlMs,
      }),
      version: 1,
      migrate: async (persistedState, fromVersion) => {
        try {
          const s = persistedState || {};
          return {
            events: Array.isArray(s.events) ? s.events : [],
            lastFetchedAt:
              typeof s.lastFetchedAt === 'number' ? s.lastFetchedAt : 0,
            ttlMs: typeof s.ttlMs === 'number' ? s.ttlMs : 5 * 60 * 1000,
          };
        } catch {
          return { events: [], lastFetchedAt: 0, ttlMs: 5 * 60 * 1000 };
        }
      },
      onRehydrateStorage: () => (state) => {
        // After rehydrate, drop stale events based on ttl
        try {
          const ttl = state?.ttlMs || 5 * 60 * 1000;
          const last = state?.lastFetchedAt || 0;
          const isStale = !last || Date.now() - last > ttl;
          if (isStale) {
            useEventStore.setState({ events: [], needsRefresh: true });
          } else {
            useEventStore.setState({ needsRefresh: false });
          }
        } catch {}
      },
    }
  )
);
