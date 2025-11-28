import { create } from 'zustand';
import { listenToSavedEvents } from '../api/savedEventsService';

function toDate(value) {
  if (!value) return null;
  try {
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number')
      return new Date(
        value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6)
      );
    if (typeof value === 'number') return new Date(value);
  } catch {}
  return null;
}

const initialState = {
  userId: null,
  savedEvents: [],
  savedMap: {},
  isLoading: false,
  isReady: false,
  error: null,
  _unsubscribe: null,
};

export const useSavedEventsStore = create((set, get) => ({
  ...initialState,

  ensureSubscribed: (uid) => {
    const state = get();
    if (state.userId === uid && state._unsubscribe) return state._unsubscribe;

    if (state._unsubscribe) {
      try {
        state._unsubscribe();
      } catch {}
    }

    if (!uid) {
      set({ ...initialState });
      return () => {};
    }

    set({
      userId: uid,
      isLoading: true,
      isReady: false,
      error: null,
    });

    const unsubscribe = listenToSavedEvents(
      uid,
      (items) => {
        const map = {};
        const normalized = items
          .map((item) => {
            const eventId =
              (typeof item?.eventId === 'string' && item.eventId) || item?.id;
            if (!eventId) return null;
            const savedAtDate = toDate(item.savedAt);
            const eventStartDate = toDate(item.eventStart);
            const record = {
              id: item.id || eventId,
              eventId,
              savedAt: savedAtDate,
              savedAtMs: savedAtDate ? savedAtDate.getTime() : 0,
              eventStart: eventStartDate,
              eventStartMs: eventStartDate ? eventStartDate.getTime() : 0,
              interest:
                typeof item.interest === 'string' ? item.interest : null,
              category:
                typeof item.category === 'string' ? item.category : null,
              surface:
                typeof item.surface === 'string' ? item.surface : null,
              source:
                typeof item.source === 'string' ? item.source : null,
            };
            map[eventId] = record;
            return record;
          })
          .filter(Boolean)
          .sort((a, b) => b.savedAtMs - a.savedAtMs);

        set({
          savedEvents: normalized,
          savedMap: map,
          isLoading: false,
          isReady: true,
          error: null,
        });
      },
      (err) => {
        set({
          error: err?.message || 'Failed to load saved events',
          isLoading: false,
          isReady: true,
        });
      }
    );

    set({ _unsubscribe: unsubscribe });
    return unsubscribe;
  },

  reset: () => {
    const state = get();
    if (state._unsubscribe) {
      try {
        state._unsubscribe();
      } catch {}
    }
    set({ ...initialState });
  },

  isSaved: (eventId) => {
    if (!eventId) return false;
    const map = get().savedMap;
    return !!map[eventId];
  },
}));
