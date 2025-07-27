import React, { useState, useEffect, memo } from 'react';
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
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';

// Description: Renders a notification card based on type
const NotificationCard = memo(({ item, onAccept, onDeny, navigation }) => {
  const renderActions = () => (
    <View style={styles.actionRow}>
      <TouchableOpacity
        style={[styles.actionButton, styles.acceptButton]}
        onPress={() => onAccept(item.fromUserId, item.id)}
        accessibilityLabel='Accept request'
      >
        <Text style={styles.actionText}>Accept</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionButton, styles.denyButton]}
        onPress={() => onDeny(item.fromUserId, item.id)}
        accessibilityLabel='Deny request'
      >
        <Text style={styles.actionText}>Deny</Text>
      </TouchableOpacity>
    </View>
  );

  const renderContent = () => {
    switch (item.type) {
      case 'friend_request':
        return (
          <>
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
            {renderActions()}
          </>
        );
      case 'rsvp_request':
        return (
          <>
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
                {item.fromUserName} requested to join your event
              </Text>
            </View>
            {renderActions()}
          </>
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

  return (
    <View
      style={[styles.card, item.type === 'rsvp_request' && styles.centeredCard]}
    >
      {renderContent()}
    </View>
  );
});

const NotificationScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifArr = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setNotifications(notifArr);
    });
    return unsubscribe;
  }, [user?.uid]);

  const handleAccept = async (fromUserId, notificationId) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        friends: [...(user.friends || []), fromUserId],
      });
      const fromUserDocRef = doc(db, 'users', fromUserId);
      const fromUserSnap = await getDoc(fromUserDocRef);
      const fromUserData = fromUserSnap.exists() ? fromUserSnap.data() : {};
      await updateDoc(fromUserDocRef, {
        friends: [...(fromUserData.friends || []), user.uid],
      });
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
      alert(`Accepted friend request from: ${fromUserId}`);
    } catch (err) {
      alert('Failed to accept friend request.');
    }
  };

  const handleDeny = async (fromUserId, notificationId) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        friendRequests: (user.friendRequests || []).filter(
          (id) => id !== fromUserId
        ),
      });
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
      alert(`Denied friend request from: ${fromUserId}`);
    } catch (err) {
      alert('Failed to deny friend request.');
    }
  };

  const confirmDeleteNotification = (id) => {
    setPendingDeleteId(id);
    setDeleteModalVisible(true);
  };

  const handleDeleteNotification = () => {
    setNotifications((prev) => prev.filter((n) => n.id !== pendingDeleteId));
    setDeleteModalVisible(false);
    setPendingDeleteId(null);
  };

  const renderHiddenItem = (data) => (
    <View style={styles.rowBack}>
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => confirmDeleteNotification(data.item.id)}
        accessibilityLabel='Delete notification'
      >
        <MaterialCommunityIcons name='delete' size={24} color='#fff' />
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
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
          renderItem={({ item }) => (
            <NotificationCard
              item={item}
              onAccept={handleAccept}
              onDeny={handleDeny}
              navigation={navigation}
            />
          )}
          renderHiddenItem={renderHiddenItem}
          rightOpenValue={-80}
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
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f6ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    elevation: 1,
  },
  centeredCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { marginRight: 12 },
  centeredIcon: {
    marginBottom: 8,
  },
  textContainer: { flex: 1 },
  message: { fontSize: 16, color: '#222', fontWeight: '500' },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
    textAlign: 'center',
    marginBottom: 4,
  },
  time: { fontSize: 13, color: '#888', marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButton: {
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginLeft: 4,
  },
  acceptButton: {
    backgroundColor: '#28a745',
  },
  denyButton: {
    backgroundColor: '#dc3545',
  },
  actionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  rowBack: {
    alignItems: 'center',
    backgroundColor: '#dc3545',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderRadius: 8,
    marginBottom: 12,
    marginRight: 16,
    marginLeft: 16,
    paddingRight: 16,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 8,
    flexDirection: 'column',
  },
  deleteText: {
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 2,
  },
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
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginHorizontal: 4,
  },
  modalCancel: {
    backgroundColor: '#eee',
  },
  modalDelete: {
    backgroundColor: '#dc3545',
  },
  modalButtonText: {
    color: '#222',
    fontWeight: 'bold',
    fontSize: 15,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
});

export default NotificationScreen;
