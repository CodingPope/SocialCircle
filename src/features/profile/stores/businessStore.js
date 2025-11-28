import { create } from 'zustand';
import { db } from '../../../services/firebase/config';

// Description: Store for business accounts, sponsored events, and analytics
export const useBusinessStore = create((set) => ({
  // List of business objects
  businesses: [],
  // Sponsored event pins
  sponsoredEvents: [],
  // Locations for the currently viewed business
  locations: [],
  // Loading state for async actions
  loading: false,
  // Error state for async actions
  error: null,

  // Fetch businesses where the user is a member (Owner/Manager/Staff)
  fetchMyBusinesses: async (uid) => {
    if (!uid) return;
    set({ loading: true, error: null });
    try {
      // membership mirror: businessMembers/{uid}/memberships/{bizId}
      const membershipsRef = db
        .collection('businessMembers')
        .doc(uid)
        .collection('memberships');
      const memSnap = await membershipsRef.get();
      const ids = memSnap.docs.map((d) => d.id);
      if (ids.length === 0) {
        set({ businesses: [] });
      } else {
        const reads = ids.map((id) =>
          db.collection('businesses').doc(id).get()
        );
        const results = await Promise.allSettled(reads);
        const list = results
          .filter((r) => r.status === 'fulfilled' && r.value.exists)
          .map((r) => ({ id: r.value.id, ...r.value.data() }))
          // hide suspended/draft by default in app surfaces
          .filter((b) => (b.status || 'active') !== 'suspended');
        set({ businesses: list });
      }
    } catch (err) {
      set({ error: err?.message || 'Failed to fetch businesses' });
    }
    set({ loading: false });
  },

  // Search active businesses by tokenized name (searchTokens) and optional category
  searchBusinesses: async ({ term, category } = {}) => {
    set({ loading: true, error: null });
    try {
      let queryRef = db
        .collection('businesses')
        .where('status', '==', 'active');
      const token = (term || '').trim().toLowerCase();
      if (token) queryRef = queryRef.where('searchTokens', 'array-contains', token);
      if (category) queryRef = queryRef.where('category', '==', category);
      const snap = await queryRef.get();
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      set({ businesses: list });
    } catch (err) {
      set({ error: err?.message || 'Failed to search businesses' });
    }
    set({ loading: false });
  },

  // Fetch locations for a given business
  fetchLocations: async (bizId) => {
    if (!bizId) return [];
    set({ loading: true, error: null });
    try {
      const locRef = db
        .collection('businesses')
        .doc(bizId)
        .collection('locations');
      const snap = await locRef.get();
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      set({ locations: list });
      return list;
    } catch (err) {
      set({ error: err?.message || 'Failed to fetch locations' });
      return [];
    } finally {
      set({ loading: false });
    }
  },

  // Fetch sponsored events from Firestore (placeholder; awaiting server flags)
  fetchSponsoredEvents: async () => {
    set({ loading: true, error: null });
    try {
      // TODO: Server should tag events with sponsored:true and businessId
      // Example query when ready:
      // const qy = query(collection(db, 'events'), where('sponsored', '==', true), where('status','==','active'));
      // const snap = await getDocs(qy);
      // const sponsoredEvents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // set({ sponsoredEvents });
    } catch (err) {
      set({ error: err.message || 'Failed to fetch sponsored events' });
    }
    set({ loading: false });
  },

  // Example: Pin a business venue on the map (server-managed; placeholder here)
  pinVenue: async (businessId, location) => {
    set({ loading: true, error: null });
    try {
      // Writes are server-managed per rules; call a Cloud Function instead in production
      // await httpsCallable(functions, 'pinBusinessVenue')({ businessId, location });
    } catch (err) {
      set({ error: err.message || 'Failed to pin venue' });
    }
    set({ loading: false });
  },

  // Example: Get analytics for a business (will be backed by CF/BigQuery)
  fetchAnalytics: async (businessId) => {
    set({ loading: true, error: null });
    try {
      // Placeholder: call a callable function when backend is ready
      // const res = await httpsCallable(functions, 'getBusinessAnalytics')({ businessId });
      // return res.data;
      return null;
    } catch (err) {
      set({ error: err.message || 'Failed to fetch analytics' });
      return null;
    } finally {
      set({ loading: false });
    }
  },
}));
