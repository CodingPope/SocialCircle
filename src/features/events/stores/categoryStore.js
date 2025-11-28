import { create } from 'zustand';
import { db } from '../../../services/firebase/config';

// Description: Store for event categories, used for filtering and pin colors
export const useCategoryStore = create((set) => ({
  categories: [], // List of category objects
  loading: false,

  // Fetch categories from Firestore
  fetchCategories: async () => {
    set({ loading: true });
    // Firestore query for categories
    // ...
    set({ loading: false });
  },

  // ...other category actions
}));
