import React, { useState, useEffect, memo } from 'react';
import { Image, ActivityIndicator } from 'react-native';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { SwipeListView } from 'react-native-swipe-list-view';
import { useUserStore } from '../../store/userStore';
import { db } from '../../firebase/config';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp, // Description: For soft delete timestamp & readAt
} from 'firebase/firestore';

// Description: Renders a notification card based on type
const NotificationCard = memo(({ item, onAccept, onDeny, navigation }) => {
  const [requester, setRequester] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only fetch for RSVP notifications
    if (item.type === 'rsvp_request' && item.requesterId) {
      setLoading(true);
      (async () => {
        // You can fetch requester data here if needed
        setLoading(false);
      })();
    }
  }, [item.type, item.requesterId]);

  const renderContent = () => {
    switch (item.type) {
      case 'friend_request':
        return (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              item.fromUserId &&
              navigation.navigate('OtherUserProfile', {
                userId: item.fromUserId,
              })
            }
            accessibilityLabel='Go to user profile'
          >
            <MaterialCommunityIcons
              name='account-plus'
              size={28}
              color='#0066cc'
              style={styles.icon}
            />
            <View style={styles.textContainer}>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.time}>{item.time}</Text>
            </View>
          </TouchableOpacity>
        );
      case 'rsvp_request':
        return (
          <View style={styles.card}>
            <MaterialCommunityIcons
              name='account-check'
              size={32}
              color='#0066cc'
              style={styles.centeredIcon}
            />
            <View style={styles.textContainer}>
              <Text style={styles.eventTitle}>
                {item.eventTitle || 'Event Title Unavailable'}
              </Text>
              <Text style={styles.message}>
                {item.userName || item.fromUserName || 'Someone'} requested to
                join your event
              </Text>
              {item.eventLocation && (
                <Text style={styles.locationText}>
                  Location: {item.eventLocation}
                </Text>
              )}
            </View>
            {renderActions()}
          </View>
        );
      default:
        return (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              item.eventId &&
              navigation.navigate('EventChat', { eventId: item.eventId })
            }
            accessibilityLabel='Go to event chat'
          >
            <MaterialCommunityIcons
              name={
                item.type === 'event_update'
                  ? 'calendar-alert'
                  : 'account-group'
              }
              size={28}
              color='#0066cc'
              style={styles.icon}
            />
            <View style={styles.textContainer}>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.time}>{item.time}</Text>
            </View>
          </TouchableOpacity>
        );
    }
  };

  // Render action buttons for RSVP requests
  const renderActions = () => {
    if (item.type !== 'rsvp_request') return null;
    return (
      <View style={styles.actionCol}>
        <TouchableOpacity
          style={[styles.pillBtn, styles.acceptBtn]}
          onPress={() => onAccept(item.requesterId, item.id, item.eventId)}
          accessibilityLabel='Accept RSVP'
        >
          <Text style={styles.pillText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pillBtn, styles.denyBtn]}
          onPress={() => onDeny(item.requesterId, item.id, item.eventId)}
          accessibilityLabel='Deny RSVP'
        >
          <Text style={styles.pillText}>Deny</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return renderContent();
});

const NotificationScreen = () => {
  const navigation = useNavigation();
  // Description: Get user from Zustand store
  const user = useUserStore((state) => state.user);
  const [notifications, setNotifications] = useState([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.uid)
    );
    let unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifArr = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((n) => !n.isDeleted); // Description: hide soft-deleted
        setNotifications(notifArr);
        // Description: Mark any unread notifications as read immediately when viewed
        markAllAsRead(notifArr);
      },
      (error) => {
        if (error?.code === 'permission-denied') {
          setNotifications([]);
          try {
            unsubscribe && unsubscribe();
          } catch {}
          return;
        }
        console.error('Notifications listener error:', error);
      }
    );

    // Track globally so logout can proactively stop it
    try {
      if (!global.unsubscribeAllListeners) global.unsubscribeAllListeners = [];
      global.unsubscribeAllListeners.push(unsubscribe);
    } catch {}

    return () => {
      try {
        unsubscribe && unsubscribe();
      } catch {}
    };
  }, [user?.uid]);

  // Description: Batch mark notifications as read (idempotent)
  const markAllAsRead = async (notifArr) => {
    const unreadIds = notifArr.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    try {
      await Promise.all(
        unreadIds.map((id) =>
          updateDoc(doc(db, 'notifications', id), {
            read: true,
            readAt: serverTimestamp(),
          })
        )
      );
    } catch (err) {
      console.error('Failed to mark notifications read', err);
    }
  };

  // Accept RSVP request (add to attendees, remove from requests, send notification)
  const handleAccept = async (requesterId, notificationId, eventId) => {
    try {
      const eventRef = doc(db, 'events', eventId);
      const eventSnap = await getDoc(eventRef);
      const eventData = eventSnap.exists() ? eventSnap.data() : {};
      await updateDoc(eventRef, {
        attendees: Array.isArray(eventData.attendees)
          ? [...eventData.attendees, requesterId]
          : [requesterId],
        requests: Array.isArray(eventData.requests)
          ? eventData.requests.filter((id) => id !== requesterId)
          : [],
      });
      // Notify the requester
      const eventTitle = eventData.title || 'Untitled Event';
      await require('../../firebase/config').sendNotification(
        'request_accepted',
        requesterId,
        {
          eventId,
          eventTitle,
          message: `Your RSVP to "${eventTitle}" was accepted! Tap to view details.`,
          linkType: 'event',
          linkId: eventId,
        }
      );
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
      alert('Request accepted. User added to attendees.');
    } catch (err) {
      alert('Failed to accept request.');
    }
  };

  // Deny RSVP request (remove from requests, do NOT send notification anymore per product decision)
  const handleDeny = async (requesterId, notificationId, eventId) => {
    try {
      const eventRef = doc(db, 'events', eventId);
      const eventSnap = await getDoc(eventRef);
      const eventData = eventSnap.exists() ? eventSnap.data() : {};
      await updateDoc(eventRef, {
        requests: Array.isArray(eventData.requests)
          ? eventData.requests.filter((id) => id !== requesterId)
          : [],
      });
      // NOTE: Removed 'request_declined' notification to avoid negative user experience.
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
      alert('Request denied (no notification sent).');
    } catch (err) {
      alert('Failed to deny request.');
    }
  };

  const confirmDeleteNotification = (id) => {
    setPendingDeleteId(id);
    setDeleteModalVisible(true);
  };

  const handleDeleteNotification = async () => {
    // Description: Soft delete: mark notification as deleted; listener will auto-remove
    try {
      if (pendingDeleteId) {
        await updateDoc(doc(db, 'notifications', pendingDeleteId), {
          isDeleted: true,
          deletedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('Soft delete failed', err);
      // Fallback: optimistic local filter
      setNotifications((prev) => prev.filter((n) => n.id !== pendingDeleteId));
    } finally {
      setDeleteModalVisible(false);
      setPendingDeleteId(null);
    }
  };

  // ----- key: use a shared outer container so hidden row == card height -----
  const renderItem = ({ item }) => (
    <View style={styles.rowContainer}>
      <NotificationCard
        item={item}
        onAccept={handleAccept}
        onDeny={handleDeny}
        navigation={navigation}
      />
    </View>
  );

  const renderHiddenItem = (data) => (
    <View style={styles.rowContainer}>
      <View style={styles.hiddenRow}>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => confirmDeleteNotification(data.item.id)}
          accessibilityLabel='Delete notification'
        >
          <MaterialCommunityIcons name='delete' size={20} color='#fff' />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel='Go back'
        >
          <Ionicons name='arrow-back' size={28} color='#222' />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
      </View>
      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No notifications yet.</Text>
        </View>
      ) : (
        <SwipeListView
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          renderHiddenItem={renderHiddenItem}
          rightOpenValue={-84} // match delete width
          disableRightSwipe
        />
      )}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType='fade'
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Notification?</Text>
            <Text style={styles.modalDesc}>
              Are you sure you want to delete this notification?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalDelete]}
                onPress={handleDeleteNotification}
              >
                <Text style={styles.modalButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  // shared outer wrapper so visible & hidden rows share height/spacing
  rowContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden', // keep rounded corners on swipe
    backgroundColor: 'transparent',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#f9f9f9',
  },
  backButton: {
    marginRight: 8,
    padding: 4,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#222' },
  list: { paddingTop: 16, paddingBottom: 8 },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    gap: 12,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#F2F4F7',
  },
  avatar: { width: 48, height: 48, borderRadius: 12 },
  avatarLoader: { padding: 6 },

  cardBody: { flex: 1, minWidth: 0 },
  eventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  userName: { fontSize: 14, fontWeight: '600', color: '#111', flexShrink: 1 },
  userMeta: { fontSize: 12, color: '#667085' },
  message: { fontSize: 13.5, color: '#344054', marginTop: 2 },

  // Actions
  actionCol: { alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  pillBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  acceptBtn: { backgroundColor: '#22C55E' },
  denyBtn: { backgroundColor: '#EF4444' },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Hidden row (revealed on swipe)
  hiddenRow: {
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    backgroundColor: 'transparent',
  },
  deleteBtn: {
    width: 84,
    backgroundColor: '#dc3545',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  deleteText: { color: '#fff', fontWeight: 'bold', marginTop: 2, fontSize: 12 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: 280,
    alignItems: 'center',
    elevation: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#222',
  },
  modalDesc: {
    fontSize: 15,
    color: '#444',
    marginBottom: 18,
    textAlign: 'center',
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginHorizontal: 4,
  },
  modalCancel: { backgroundColor: '#eee' },
  modalDelete: { backgroundColor: '#dc3545' },
  modalButtonText: { color: '#222', fontWeight: 'bold', fontSize: 15 },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: { fontSize: 16, color: '#888', textAlign: 'center' },
});

export default NotificationScreen;
