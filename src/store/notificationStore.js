// Description: Zustand store for notifications
import { create } from 'zustand';

export const useNotificationStore = create((set) => ({
  notifications: [],
  setNotifications: (notifications) => set({ notifications }),
  // Add more notification-related actions as needed
}));
