import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  arrayRemove,
  doc,
} from 'firebase/firestore';
import { db, reportContent } from '../firebase/config';
import { useUserStore } from '../store/userStore';
import smileDefault from '../../assets/smileDefault.png';
import * as Haptics from 'expo-haptics';

export default function AttendeeList({
  attendees = [],
  eventId,
  isCreator,
  navigation, // Ensure navigation prop is received
  readOnly = false,
}) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const currentUser = useUserStore((s) => s.user);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!attendees.length) {
        setUsers([]);
        return;
      }
      try {
        const chunks = [];
        for (let i = 0; i < attendees.length; i += 10) {
          chunks.push(attendees.slice(i, i + 10));
        }
        let allUsers = [];
        for (const chunk of chunks) {
          const q = query(
            collection(db, 'users'),
            where('__name__', 'in', chunk)
          );
          const snapshot = await getDocs(q);
          allUsers = allUsers.concat(
            snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          );
        }
        // Filter out users who are soft-deleted (isDeleted === true)
        setUsers(allUsers.filter((user) => !user.isDeleted));
      } catch (err) {
        console.error('Error fetching attendee users:', err);
      }
    };
    fetchUsers();
  }, [attendees]);

  const handleRemoveAttendee = async (userId) => {
    if (readOnly) {
      Alert.alert('Action unavailable', 'This event is archived or ended.');
      return;
    }
    if (!eventId || !userId) return;
    try {
      // Description: Remove userId from event.attendees array
      const eventRef = doc(db, 'events', eventId);
      await updateDoc(eventRef, {
        attendees: arrayRemove(userId),
      });

      // Description: Remove eventId from user's attended / attending arrays (support both naming variants)
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        attendedEvents: arrayRemove(eventId),
        attendingEvents: arrayRemove(eventId), // in case this variant exists
      });

      // Description: Optimistically update local list
      setUsers((prev) => prev.filter((user) => user.id !== userId));
    } catch (err) {
      console.error('Error removing attendee:', err);
      Alert.alert('Removal Failed', 'Could not remove attendee. Try again.');
    }
  };

  // Unified long-press options handler (iOS ActionSheet / Android modal)
  const openOptions = (user) => {
    if (readOnly) return; // don't open options on archived events
    // Haptics (try/catch in case not available in environment)
    Haptics.selectionAsync?.().catch(() => {});
    console.log('Long press detected on user:', user?.id); // DEBUG

    if (Platform.OS === 'ios') {
      import('react-native').then(({ ActionSheetIOS }) => {
        const options = isCreator
          ? ['View Profile', 'Remove User', 'Cancel']
          : ['View Profile', 'Report User', 'Cancel'];
        const destructiveIndex = isCreator ? 1 : 1; // removal OR report
        const cancelIndex = 2;

        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            cancelButtonIndex: cancelIndex,
            destructiveButtonIndex: destructiveIndex,
          },
          (buttonIndex) => {
            if (buttonIndex === 0) {
              navigation.navigate('OtherUserProfile', { userId: user.id });
            } else if (buttonIndex === 1 && isCreator) {
              // Confirm removal for safety
              Alert.alert(
                'Remove Attendee',
                'Remove this attendee from the event? They will lose chat access.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => handleRemoveAttendee(user.id),
                  },
                ]
              );
            } else if (buttonIndex === 1 && !isCreator) {
              // Future: open report modal
              if (!currentUser?.uid) return;
              reportContent(
                currentUser.uid,
                user.id,
                'user',
                'Inappropriate behavior',
                {
                  details: `Reported from attendee list in event ${eventId}`,
                  context: { eventId },
                }
              )
                .then(() => Alert.alert('Report', 'Thanks for the report.'))
                .catch(() => Alert.alert('Report', 'Failed to submit report.'));
            }
          }
        );
      });
    } else {
      setSelectedUser(user);
      setModalVisible(true);
    }
  };

  const handleModalAction = (action) => {
    setModalVisible(false);
    if (!selectedUser) return;

    if (action === 'view') {
      navigation.navigate('OtherUserProfile', { userId: selectedUser.id });
    } else if (action === 'remove' && isCreator) {
      if (readOnly) {
        Alert.alert('Action unavailable', 'This event is archived or ended.');
        return;
      }
      Alert.alert(
        'Remove Attendee',
        'Remove this attendee from the event? They will lose chat access.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => handleRemoveAttendee(selectedUser.id),
          },
        ]
      );
    }
  };

  // Description: Render single attendee avatar + name with long press options
  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.attendee}
      onPress={() =>
        navigation.navigate('OtherUserProfile', { userId: item.id })
      }
      onLongPress={() => openOptions(item)}
      delayLongPress={400}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole='button'
      accessibilityLabel={`Attendee ${item.displayName || 'User'}`}
    >
      <Image
        source={
          item.profileImage
            ? { uri: item.profileImage }
            : item.avatarURL
            ? { uri: item.avatarURL }
            : smileDefault
        }
        style={styles.avatar}
      />
      <Text style={styles.name}>{item.displayName || 'User'}</Text>
    </TouchableOpacity>
  );

  if (!users.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No attendees yet</Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        pointerEvents='auto'
      />

      {/* Android / cross-platform modal options */}
      <Modal
        visible={modalVisible}
        transparent
        animationType='fade'
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Options</Text>
            <Pressable
              style={styles.modalButton}
              onPress={() => handleModalAction('view')}
            >
              <Text style={styles.modalButtonText}>View Profile</Text>
            </Pressable>
            {isCreator && (
              <Pressable
                style={[styles.modalButton, { backgroundColor: '#FF3B30' }]}
                onPress={() => handleModalAction('remove')}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                  Remove User
                </Text>
              </Pressable>
            )}
            {!isCreator && (
              <Pressable
                style={styles.modalButton}
                onPress={() => {
                  setModalVisible(false);
                  if (!currentUser?.uid || !selectedUser?.id) return;
                  reportContent(
                    currentUser.uid,
                    selectedUser.id,
                    'user',
                    'Inappropriate behavior',
                    {
                      details: `Reported from attendee list in event ${eventId}`,
                      context: { eventId },
                    }
                  )
                    .then(() => Alert.alert('Report', 'Thanks for the report.'))
                    .catch(() =>
                      Alert.alert('Report', 'Failed to submit report.')
                    );
                }}
              >
                <Text style={styles.modalButtonText}>Report User</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.modalCancel}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  attendee: {
    alignItems: 'center',
    marginRight: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eee',
    marginBottom: 4,
  },
  name: {
    fontSize: 12,
    color: '#333',
    maxWidth: 60,
    textAlign: 'center',
  },
  emptyContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBox: {
    width: 240,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 5,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalButton: {
    width: '100%',
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignItems: 'center',
    marginVertical: 4,
  },
  modalButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },
  modalCancel: {
    marginTop: 6,
  },
  modalCancelText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
});
