// Description: Persisted store for session role (consumer or business)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// role: 'consumer' | 'business'
export const useSessionRole = create(
  persist(
    (set, get) => ({
      role: 'consumer',
      nextBusinessRoute: null, // e.g., 'BusinessOnboarding' | 'BusinessTabs' | null
      nextConsumerRoute: null, // e.g., 'Profile' | 'Map'
      setRole: (role) =>
        set({ role: role === 'business' ? 'business' : 'consumer' }),
      setNextBusinessRoute: (route) =>
        set({ nextBusinessRoute: route || null }),
      setNextConsumerRoute: (route) =>
        set({ nextConsumerRoute: route || null }),
      // New: peek without clearing (for initialRouteName decisions)
      peekNextBusinessRoute: () => get().nextBusinessRoute || null,
      peekNextConsumerRoute: () => get().nextConsumerRoute || null,
      consumeNextBusinessRoute: () => {
        const route = get().nextBusinessRoute || null;
        set({ nextBusinessRoute: null });
        return route;
      },
      consumeNextConsumerRoute: () => {
        const route = get().nextConsumerRoute || null;
        set({ nextConsumerRoute: null });
        return route;
      },
      reset: () =>
        set({
          role: 'consumer',
          nextBusinessRoute: null,
          nextConsumerRoute: null,
        }),
    }),
    {
      name: 'session-role',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
    }
  )
);
