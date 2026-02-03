import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { db } from '../services/firebase';
import { navigate } from '../navigation/RootNavigation';
import ROUTES from '../navigation/routes';
import {
  initPushForUser,
  useNotificationStore,
} from '../features/notifications';

export default function NotificationProvider({ user, children }) {
  const subscribeNotifications = useNotificationStore((s) => s.subscribe);
  const clearNotifications = useNotificationStore((s) => s.unsubscribe);
  const initializedPushRef = useRef(new Set());

  // Handle notification response navigation
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (resp) => {
        const data = resp?.notification?.request?.content?.data || {};
        try {
          if (data.linkType === 'chat' && data.eventId) {
            navigate(ROUTES.EVENT_CHAT, { eventId: data.eventId });
          } else if (data.linkType === 'event' && data.eventId) {
            navigate('EventDetail', { eventId: data.eventId });
          } else if (data.eventId && data.linkType === 'chat') {
            navigate(ROUTES.EVENT_CHAT, { eventId: data.eventId });
          } else if (data.eventId) {
            navigate('EventDetail', { eventId: data.eventId });
          } else if (data.linkType && data.linkId) {
            navigate(data.linkType, { id: data.linkId });
          }
        } catch (err) {
          console.error('[notification-handler] navigation error:', err);
        }
      },
    );
    return () => sub.remove();
  }, []);

  // Subscribe to in-app notifications
  useEffect(() => {
    if (!user?.uid) {
      clearNotifications();
      return;
    }
    const unsub = subscribeNotifications(user.uid);
    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [user?.uid, subscribeNotifications, clearNotifications]);

  // Initialize push for user once per uid
  useEffect(() => {
    if (user?.uid && !initializedPushRef.current.has(user.uid)) {
      initializedPushRef.current.add(user.uid);
      (async () => {
        try {
          const userDocRef = db.collection('users').doc(user.uid);
          const snap = await userDocRef.get();
          if (snap.exists) {
            await initPushForUser(user.uid);
          }
        } catch {}
      })();
    }
  }, [user?.uid]);

  return children;
}
