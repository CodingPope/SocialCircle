import React, { useEffect, useState, useMemo } from 'react';
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
  db,
  reportContent,
  arrayRemove,
  deleteField,
} from '../../../services/firebase';
import { trackReportContent } from '../../../lib/analytics';
import { useUserStore } from '../../profile/stores/userStore';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import smileDefault from '../../../../assets/smileDefault.png';
import * as Haptics from 'expo-haptics';
import { track as trackClient } from '../../../lib/analytics';
import { navigateToOtherUserProfile } from '../../../navigation/RootNavigation';

export default function AttendeeList({
  attendees = [],
  eventId,
  isCreator,
  navigation, // Ensure navigation prop is received
  readOnly = false,
  attendeeSnippets = null,
  attendeesCount = null,
}) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const currentUser = useUserStore((s) => s.user);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);

  // Stable keys to prevent effect churn
  const attendeesKey = useMemo(
    () => JSON.stringify(attendees || []),
    [attendees]
  );
  const snippetsKey = useMemo(() => {
    if (!attendeeSnippets) return 'none';
    return Array.isArray(attendeeSnippets)
      ? JSON.stringify(
          attendeeSnippets
            .map((s) => s?.uid)
            .filter(Boolean)
            .sort()
        )
      : JSON.stringify(Object.keys(attendeeSnippets).sort());
  }, [attendeeSnippets]);

  useEffect(() => {
    const hydrateFromSnippets = async () => {
      if (
        attendeeSnippets &&
        (Array.isArray(attendeeSnippets) ||
          typeof attendeeSnippets === 'object')
      ) {
        const arr = Array.isArray(attendeeSnippets)
          ? attendeeSnippets
          : Object.values(attendeeSnippets || {});
        const mapped = arr
          .filter((s) => s && s.uid)
          .map((s) => ({
            id: s.uid,
            profileImage: s.photoURL || null,
            avatarURL: null,
            displayName: s.name || 'User',
            verified: !!s.verified,
            rating: typeof s.rating === 'number' ? s.rating : null,
          }));
        setUsers((prev) => {
          const same =
            prev.length === mapped.length &&
            prev.every((p, i) => p.id === mapped[i].id);
          return same ? prev : mapped;
        });
        return true;
      }
      return false;
    };

    const fetchUsers = async () => {
      const ids = Array.isArray(attendees) ? attendees : [];
      if (!ids.length) {
        setUsers((prev) => (prev.length ? [] : prev));
        return;
      }
      try {
        const map = await ensureSnippets(ids);
        const mapped = ids
          .map((uid) => map.get(uid))
          .filter(Boolean)
          .map((s) => ({
            id: s.uid,
            profileImage: s.photoURL || null,
            avatarURL: null,
            displayName: s.name || 'User',
            verified: !!s.verified,
            rating: typeof s.rating === 'number' ? s.rating : null,
          }));
        setUsers((prev) => {
          const same =
            prev.length === mapped.length &&
            prev.every((p, i) => p.id === mapped[i].id);
          return same ? prev : mapped;
        });
      } catch (err) {
        console.error('Error fetching attendee users:', err);
      }
    };

    hydrateFromSnippets().then((used) => {
      if (!used) fetchUsers();
    });
  }, [attendeesKey, snippetsKey]);

  const handleRemoveAttendee = async (userId) => {
    if (readOnly) {
      Alert.alert('Action unavailable', 'This event is archived or ended.');
      return;
    }
    if (!eventId || !userId) return;
    try {
      // Description: Remove userId from event.attendees array and clear snippet
      const eventRef = db.collection('events').doc(eventId);
      const updates = {
        attendees: arrayRemove(userId),
        [`attendeeSnippets.${userId}`]: deleteField(),
      };
      await eventRef.update(updates);

      // Description: Remove eventId from user's attended / attending arrays (support both naming variants)
      const userRef = db.collection('users').doc(userId);
      await userRef.update({
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
  const openOptions = async (user) => {
    if (readOnly) return; // don't open options on archived events
    // Haptics (try/catch in case not available in environment)
    Haptics.selectionAsync?.().catch(() => {});
    // console.log('Long press detected on user:', user?.id); // DEBUG
    trackClient('attendee_long_press', {
      user_id: user?.id,
      event_id: eventId,
    });

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
              navigateToOtherUserProfile(user.id);
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
                .then(() => {
                  try {
                    trackReportContent({
                      content_type: 'user',
                      content_id: user.id,
                      reason_category: 'inappropriate_behavior',
                      event_id: eventId,
                      surface: 'event_detail',
                    });
                  } catch {}
                  Alert.alert('Report', 'Thanks for the report.');
                })
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
      navigateToOtherUserProfile(selectedUser.id);
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
      onPress={() => navigateToOtherUserProfile(item.id)}
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={styles.name}>{item.displayName || 'User'}</Text>
        {item?.verification?.status === 'verified' && (
          <Ionicons name='checkmark-circle' size={14} color='#2563EB' />
        )}
      </View>
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
                    .then(() => {
                      try {
                        trackReportContent({
                          content_type: 'user',
                          content_id: selectedUser.id,
                          reason_category: 'inappropriate_behavior',
                          event_id: eventId,
                          surface: 'event_detail',
                        });
                      } catch {}
                      Alert.alert('Report', 'Thanks for the report.');
                    })
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
