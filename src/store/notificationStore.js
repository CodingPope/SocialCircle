// Description: Zustand store for notifications (subscribe, mark as read, soft delete)
import { create } from 'zustand';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  writeBatch,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  loading: false,
  error: null,
  _unsubscribe: null,

  // Replace all notifications in state
  setNotifications: (notifications) => set({ notifications }),

  // Subscribe to the signed-in user's notifications
  subscribe: (userId) => {
    try {
      // Stop existing listener if present
      const prevUnsub = get()._unsubscribe;
      if (typeof prevUnsub === 'function') {
        try { prevUnsub(); } catch {}
      }
      if (!userId) {
        set({ notifications: [], loading: false, _unsubscribe: null });
        return () => {};
      }

      set({ loading: true, error: null });
      const q = query(collection(db, 'notifications'), where('recipientId', '==', userId));
      const unsub = onSnapshot(
        q,
        async (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((n) => !n.isDeleted);
          set({ notifications: list, loading: false });

          // Opportunistically mark unread as read (idempotent)
          try {
            await get().markAllAsRead(list);
          } catch {}
        },
        (err) => {
          set({ loading: false, error: err?.message || String(err) });
        }
      );

      set({ _unsubscribe: unsub });
      return unsub;
    } catch (e) {
      set({ error: e?.message || String(e), loading: false });
      return () => {};
    }
  },

  // Unsubscribe and clear
  unsubscribe: () => {
    const prevUnsub = get()._unsubscribe;
    if (typeof prevUnsub === 'function') {
      try { prevUnsub(); } catch {}
    }
    set({ _unsubscribe: null });
  },

  // Mark a single notification as read
  markAsRead: async (id) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'notifications', id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (e) {
      // swallow; UI is optimistic
      console.warn('[notifications] markAsRead failed:', e?.message || e);
    }
  },

  // Batch mark all unread notifications in the provided list as read
  markAllAsRead: async (notifications) => {
    const list = Array.isArray(notifications) ? notifications : get().notifications;
    const unread = list.filter((n) => !n.read);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, 'notifications', n.id), {
          read: true,
          readAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (e) {
      console.warn('[notifications] markAllAsRead failed:', e?.message || e);
    }
  },

  // Soft delete a notification
  softDelete: async (id) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'notifications', id), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[notifications] softDelete failed:', e?.message || e);
      // Optimistic local removal
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
    }
  },
}));
