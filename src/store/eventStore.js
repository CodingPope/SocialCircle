import { create } from 'zustand';
import { db } from '../firebase/config';

// Description: Zustand store for events, RSVP, waitlist, and event creation
export const useEventStore = create((set, get) => ({
  // List of event objects
  events: [],
  // Loading state for async actions
  loading: false,

  // Set events list
  setEvents: (events) => set({ events }),

  // Fetch events from Firestore
  fetchEvents: async () => {
    set({ loading: true });
    // TODO: Firestore query for events
    // ...
    set({ loading: false });
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
      // Example: set chat metadata in chatStore if available
      try {
        const chatModule = await import('../store/chatStore');
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
      } catch (e) {
        // ignore if chatStore not present or addChat not implemented
      }

      set({ loading: false });
      return data;
    } catch (err) {
      console.error('rsvpEvent error:', err);
      set({ loading: false });
      throw err;
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
}));
