import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, callFirebaseFunction } from '../../../services/firebase';

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

      // Fetch events from Firestore via Cloud Function (delegates to server-side geohash query)
      // Accepts optional { interests, location, radiusInM } to scope the query
      fetchEvents: async ({
        interests = [],
        location = null,
        radiusInM = 32093,
      } = {}) => {
        set({ loading: true });
        try {
          const data = await callFirebaseFunction('getEvents', {
            interests,
            ...(location ? { location } : {}),
            radiusInM,
          });
          const events = Array.isArray(data?.events)
            ? data.events
            : Array.isArray(data)
              ? data
              : [];
          get().setEvents(events);
        } catch (err) {
          // Non-fatal: UI falls back to useDiscoveryFeed hook
          console.warn('[eventStore] fetchEvents failed:', err?.message || err);
        } finally {
          set({ loading: false });
        }
      },

      // RSVP to an event
      rsvpEvent: async (eventId, userId) => {
        set({ loading: true });
        try {
          // Use shared callable helper so auth tokens refresh automatically
          const data =
            (await callFirebaseFunction('rsvpEvent', { eventId, userId })) ||
            {};

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
                : ev,
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
        set({ loading: true });
        try {
          const data =
            (await callFirebaseFunction('joinWaitlist', { eventId })) || {};

          // Optimistic local update: add user to event.waitlist in local store if present
          set((state) => ({
            events: state.events.map((ev) =>
              ev.id === eventId
                ? {
                    ...ev,
                    waitlist: Array.isArray(ev.waitlist)
                      ? Array.from(new Set([...ev.waitlist, userId]))
                      : [userId],
                    waitlistCount:
                      typeof ev.waitlistCount === 'number'
                        ? ev.waitlistCount + 1
                        : 1,
                  }
                : ev,
            ),
          }));

          return data;
        } catch (error) {
          console.error('Join waitlist failed:', error);
          throw error;
        } finally {
          set({ loading: false });
        }
      },

      // Create a new event
      // Note: Full creation logic lives in CreateEventScreen.js (direct Firestore write).
      // This store action is available as a callable shim for programmatic callers.
      createEvent: async (eventData) => {
        if (!eventData) return null;
        try {
          const data = await callFirebaseFunction('createEvent', eventData);
          if (data?.eventId) {
            // Optimistically add to local store if server returns the doc
            if (data.event) {
              set((state) => ({
                events: [data.event, ...state.events],
              }));
            }
            return data.eventId;
          }
          return null;
        } catch (err) {
          console.warn('[eventStore] createEvent failed:', err?.message || err);
          throw err;
        }
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
    },
  ),
);
