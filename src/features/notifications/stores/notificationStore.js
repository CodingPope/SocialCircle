// Description: Zustand store for notifications (subscribe, mark as read, soft delete)
import { create } from 'zustand';
import { db, serverTimestamp } from '../../../services/firebase';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  writeBatch,
} from '../../../services/firebase/firestoreCompat';
import logger from '../../../lib/logger';

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  loading: false,
  error: null,
  _unsubscribe: null,
  activeUid: null,
  unreadCount: 0,
  hasUnread: false,

  // Replace all notifications in state
  setNotifications: (notifications) => set({ notifications }),

  // Subscribe to the signed-in user's notifications
  subscribe: (userId) => {
    try {
      // Stop existing listener if present
      const prevUnsub = get()._unsubscribe;
      if (typeof prevUnsub === 'function' && get().activeUid !== userId) {
        try {
          prevUnsub();
        } catch {}
      }
      if (!userId) {
        set({
          notifications: [],
          loading: false,
          error: null,
          _unsubscribe: null,
          activeUid: null,
          unreadCount: 0,
          hasUnread: false,
        });
        return () => {};
      }

      // If already listening for this uid, reuse existing listener
      if (get().activeUid === userId && typeof prevUnsub === 'function') {
        return prevUnsub;
      }

      set({ loading: true, error: null });
      // Limit notifications query to most recent 100 to prevent unbounded reads
      const queryRef = query(
        collection(db, 'notifications'),
        where('recipientId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100),
      );
      const unsub = onSnapshot(
        queryRef,
        async (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((n) => !n.isDeleted);
          const unread = list.filter((n) => !n.read).length;
          set({
            notifications: list,
            loading: false,
            unreadCount: unread,
            hasUnread: unread > 0,
          });
        },
        (err) => {
          set({
            loading: false,
            error: err?.message || String(err),
            unreadCount: get().unreadCount,
            hasUnread: get().unreadCount > 0,
          });
        },
      );

      set({ _unsubscribe: unsub, activeUid: userId });
      return unsub;
    } catch (e) {
      set({
        error: e?.message || String(e),
        loading: false,
        unreadCount: get().unreadCount,
        hasUnread: get().unreadCount > 0,
      });
      return () => {};
    }
  },

  // Unsubscribe and clear
  unsubscribe: () => {
    const prevUnsub = get()._unsubscribe;
    if (typeof prevUnsub === 'function') {
      try {
        prevUnsub();
      } catch {}
    }
    set({
      _unsubscribe: null,
      activeUid: null,
      notifications: [],
      unreadCount: 0,
      hasUnread: false,
    });
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
      logger.warn('[notifications] markAsRead failed:', e?.message || e);
    }
    set((state) => {
      const next = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      const unread = next.filter((n) => !n.read).length;
      return {
        notifications: next,
        unreadCount: unread,
        hasUnread: unread > 0,
      };
    });
  },

  // Batch mark all unread notifications in the provided list as read
  markAllAsRead: async (notifications) => {
    const list = Array.isArray(notifications)
      ? notifications
      : get().notifications;
    const unread = list.filter((n) => !n.read);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        const docRef = doc(db, 'notifications', n.id);
        batch.update(docRef, {
          read: true,
          readAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (e) {
      logger.warn('[notifications] markAllAsRead failed:', e?.message || e);
    }
    set((state) => {
      const next = state.notifications.map((n) =>
        unread.some((u) => u.id === n.id) ? { ...n, read: true } : n,
      );
      return {
        notifications: next,
        unreadCount: 0,
        hasUnread: false,
      };
    });
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
      logger.warn('[notifications] softDelete failed:', e?.message || e);
      // Optimistic local removal
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id),
        unreadCount: Math.max(
          0,
          s.notifications.filter((n) => n.id !== id && !n.read).length,
        ),
        hasUnread:
          s.notifications.filter((n) => n.id !== id && !n.read).length > 0,
      }));
      return;
    }
    set((state) => {
      const next = state.notifications.filter((n) => n.id !== id);
      const unread = next.filter((n) => !n.read).length;
      return {
        notifications: next,
        unreadCount: unread,
        hasUnread: unread > 0,
      };
    });
  },
}));
