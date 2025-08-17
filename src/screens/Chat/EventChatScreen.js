import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Linking,
  ScrollView,
  Alert,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import Modal from 'react-native-modal';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove, // Added for attendee removal
  writeBatch, // Added for leave event batching
  serverTimestamp, // Added: ensure consistent timestamps for ordering
} from 'firebase/firestore';
import {
  db,
  auth,
  sendNotification,
  updateEventCount,
  deleteEvent, // import soft-delete helper
} from '../../firebase/config';
import smileDefault from '../../../assets/smileDefault.png';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReportModal from '../../components/ReportModal'; // Import reusable modal component
import { httpsCallable, getFunctions } from 'firebase/functions';
import { reportContent } from '../../firebase/config';
import { getApp } from 'firebase/app';

const EventChatScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // Make route params defensive & provide default
  const { eventId, locationName: locationNameParam = null } =
    route.params || {};
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [hostUser, setHostUser] = useState(null);
  const [requesters, setRequesters] = useState([]); // Add state for requesters
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const flatListRef = useRef(null);

  // Track listener unsubscribes so we can stop them immediately on leave
  const eventUnsubRef = useRef(null);
  const messagesUnsubRef = useRef(null);

  // --- Read-only / archived checks ---
  const isSoftDeleted = event?.isDeleted === true;

  // Helper to get event end time in ms: prefer endAt, fallback to date + 1h
  const getEventEndMs = (ev) => {
    if (!ev) return null;
    let endMs = null;
    if (ev.endAt) {
      if (ev.endAt.toDate) endMs = ev.endAt.toDate().getTime();
      else if (typeof ev.endAt.seconds === 'number')
        endMs = ev.endAt.seconds * 1000;
    } else if (ev.date) {
      if (ev.date.toDate) endMs = ev.date.toDate().getTime();
      else if (typeof ev.date.seconds === 'number')
        endMs = ev.date.seconds * 1000;
      else if (ev.date instanceof Date) endMs = ev.date.getTime();
      // Fallback duration = 1 hour when only start date exists
      if (endMs) endMs += 60 * 60 * 1000;
    }
    return endMs;
  };

  const endMs = getEventEndMs(event);
  const nowMs = Date.now();
  const ended = !!endMs && nowMs >= endMs; // event time has passed
  const archived = !!endMs && nowMs >= endMs + 3 * 24 * 60 * 60 * 1000; // 3 days after end
  const readOnly = isSoftDeleted || archived; // Chat write disabled when archived or soft-deleted

  // Helper: Resolve best location label (expanded with more fallbacks & lat/lng variants)
  const getLocationLabel = (ev = event) => {
    if (!ev) return 'Location not available';

    // 1. Navigation param (if meaningful)
    if (
      locationNameParam &&
      !/Fetching address|Address not available|Location not specified|Unknown address/i.test(
        locationNameParam
      )
    ) {
      return locationNameParam;
    }

    // 2. Direct fields commonly used
    if (ev.locationName && typeof ev.locationName === 'string')
      return ev.locationName;
    if (ev.address && /[a-zA-Z0-9]/.test(ev.address)) return ev.address;

    // 3. Nested location object variations
    const loc = ev.location;
    if (loc) {
      if (typeof loc === 'string' && /[a-zA-Z0-9]/.test(loc)) return loc;
      if (loc.address && /[a-zA-Z0-9]/.test(loc.address)) return loc.address;
      if (loc.name && /[a-zA-Z0-9]/.test(loc.name)) return loc.name;
      if (loc.label && /[a-zA-Z0-9]/.test(loc.label)) return loc.label;

      // Geo point variants
      const lat = loc.latitude || loc.lat || loc._lat;
      const lng = loc.longitude || loc.lng || loc._long || loc.lon;
      if (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        !Number.isNaN(lat) &&
        !Number.isNaN(lng)
      ) {
        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    }

    // 4. Any legacy field
    if (ev.city && ev.state) return `${ev.city}, ${ev.state}`;
    if (ev.city) return ev.city;

    return 'Location not available';
  };

  const [resolvedLocationLabel, setResolvedLocationLabel] = useState(
    'Location not available'
  );

  // Recompute when event or param changes
  useEffect(() => {
    const label = getLocationLabel();
    setResolvedLocationLabel(label);
  }, [event, locationNameParam]);

  // Debug (remove in production)
  useEffect(() => {
    if (event) {
      console.log('[EventChat] Event location debug:', {
        eventId: eventId,
        locationNameParam,
        address: event.address,
        locationField: event.location,
        locationName: event.locationName,
        computed: getLocationLabel(),
      });
    }
  }, [event, locationNameParam, eventId]);

  // Fetch event info + attendees
  useEffect(() => {
    if (!auth.currentUser) return;

    const unsub = onSnapshot(
      doc(db, 'events', eventId),
      async (snap) => {
        const data = snap.data();
        setEvent(data);

        if (data?.attendees?.length) {
          const attendeePromises = data.attendees.map(async (uid) => {
            const userDoc = await getDoc(doc(db, 'users', uid));
            const userData = userDoc.exists() ? userDoc.data() : {};
            return {
              id: uid,
              displayName:
                userData.displayName ||
                `${userData.firstName || ''} ${
                  userData.lastName || ''
                }`.trim() ||
                'User',
              photoURL:
                userData.photoURL ||
                userData.profileImage ||
                userData.avatarURL ||
                null,
              // Rating: prefer 'rating' (current), fallback to legacy 'ranking'
              rating:
                typeof userData.rating === 'number'
                  ? userData.rating
                  : typeof userData.ranking === 'number'
                  ? userData.ranking
                  : null,
            };
          });
          const attendeeData = await Promise.all(attendeePromises);
          setAttendees(attendeeData);
        } else {
          setAttendees([]);
        }
      },
      (error) => {
        if (error?.code === 'permission-denied') {
          setEvent(null);
          setAttendees([]);
          return;
        }
        console.error('Event listener error:', error);
      }
    );

    // Save unsub refs for immediate cleanup (leave flow)
    eventUnsubRef.current = unsub;

    // ✅ Track globally for logout cleanup
    if (!global.unsubscribeAllListeners) global.unsubscribeAllListeners = [];
    global.unsubscribeAllListeners.push(unsub);

    return () => {
      try {
        unsub && unsub();
      } catch {}
      if (eventUnsubRef.current === unsub) eventUnsubRef.current = null;
    };
  }, [eventId, auth.currentUser]);

  // ✅ Chat messages listener (single source with error handler)
  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'chats', eventId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        // Ignore local pending writes to avoid brief flicker before rule rejection/commit
        const items = snap.docs
          .filter((d) => !d.metadata.hasPendingWrites)
          .map((d) => ({ id: d.id, ...d.data() }));
        setMessages(items);
        setLoading(false);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      },
      (error) => {
        if (error?.code === 'permission-denied') {
          setMessages([]);
          setLoading(false);
          return;
        }
        console.error('Chat messages listener error:', error);
      }
    );

    // Save unsub refs for immediate cleanup (leave flow)
    messagesUnsubRef.current = unsub;

    if (!global.unsubscribeAllListeners) global.unsubscribeAllListeners = [];
    global.unsubscribeAllListeners.push(unsub);

    return () => {
      try {
        unsub && unsub();
      } catch {}
      if (messagesUnsubRef.current === unsub) messagesUnsubRef.current = null;
    };
  }, [eventId, auth.currentUser]);

  // ✅ Host user info when event changes (no snapshot, just getDoc)
  useEffect(() => {
    const ownerId = event?.ownerId;
    if (ownerId) {
      getDoc(doc(db, 'users', ownerId)).then((userDoc) => {
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setHostUser({
            displayName:
              userData.displayName ||
              `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
              'User',
            photoURL: userData.profileImage || userData.avatarURL || null,
            // Rating: prefer 'rating' (current), fallback to legacy 'ranking'
            rating:
              typeof userData.rating === 'number'
                ? userData.rating
                : typeof userData.ranking === 'number'
                ? userData.ranking
                : null,
          });
        } else {
          setHostUser(null);
        }
      });
    } else {
      setHostUser(null);
    }
  }, [event?.ownerId]);

  // Check if current user is attendee
  const isAttendee =
    Array.isArray(event?.attendees) &&
    event.attendees.includes(auth.currentUser?.uid);

  // Check if current user is event creator (support both ownerId and hostId)
  const isCreator = event?.ownerId === auth.currentUser?.uid;

  // Block chat access for non-members entirely
  useEffect(() => {
    if (!event || !auth.currentUser) return;
    const isMember = isAttendee || isCreator;
    if (!isMember) {
      Alert.alert(
        'No Access',
        'Only attendees or the host can view this chat.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  }, [event?.attendees, event?.ownerId, auth.currentUser]);

  // Send message
  const sendMessage = async () => {
    // Description: Validate input and permissions, then write message with server timestamp
    const trimmed = (input || '').trim();
    if (!trimmed) return;

    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Not signed in', 'Please sign in to send messages.');
      return;
    }

    // Soft guards in UI (rules still enforce): must be host or attendee
    const allowed = isAttendee || isCreator;
    if (!allowed) {
      Alert.alert(
        'Not allowed',
        'Only attendees or the host can send messages.'
      );
      return;
    }

    // Prevent writes when event is archived or soft-deleted (3+ days after end)
    if (readOnly) {
      Alert.alert('Chat Archived', 'This chat is read-only for this event.');
      return;
    }

    try {
      await addDoc(collection(db, 'chats', eventId, 'messages'), {
        text: trimmed,
        senderId: uid,
        createdAt: serverTimestamp(), // Use server time for stable ordering
      });
      setInput('');
    } catch (err) {
      console.error('sendMessage error:', err);
      const code = err?.code || '';
      let msg = err?.message || 'Failed to send message.';
      if (code.includes('permission') || code.includes('denied')) {
        msg = 'You need to be an attendee or the host to chat in this event.';
      } else if (code.includes('unavailable')) {
        msg = 'Network unavailable. Please try again.';
      }
      Alert.alert('Send failed', msg);
    }
  };

  // Accept request handler
  const handleAcceptRequest = async (userId) => {
    if (isSoftDeleted || ended) {
      Alert.alert(
        'Action unavailable',
        'Cannot modify requests for archived or ended events.'
      );
      return;
    }
    try {
      const functions = getFunctions(getApp(), 'us-central1');
      const accept = httpsCallable(functions, 'acceptRsvpRequest');
      await accept({ eventId, userId });

      // Optimistic local update; snapshot will reconcile
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              requests: (prev.requests || []).filter((r) => r !== userId),
            }
          : prev
      );
    } catch (err) {
      console.error('Error accepting request:', err.message || err);
      alert('Failed to accept request. Please try again.');
    }
  };

  // Decline request handler
  const handleDeclineRequest = async (userId) => {
    if (isSoftDeleted || ended) {
      Alert.alert(
        'Action unavailable',
        'Cannot modify requests for archived or ended events.'
      );
      return;
    }
    try {
      const functions = getFunctions(getApp(), 'us-central1');
      const decline = httpsCallable(functions, 'declineRsvpRequest');
      await decline({ eventId, userId });

      setEvent((prev) =>
        prev
          ? {
              ...prev,
              requests: (prev.requests || []).filter((r) => r !== userId),
            }
          : prev
      );
    } catch (err) {
      console.error('Error declining request:', err.message || err);
      alert('Failed to decline request. Please try again.');
    }
  };

  // Ensure requester icon pulls correct user data
  const fetchRequesterDetails = async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          id: userDoc.id,
          displayName:
            userData.displayName ||
            `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
            'User',
          photoURL: userData.profileImage || smileDefault,
          rating:
            typeof userData.rating === 'number'
              ? userData.rating.toFixed(1)
              : typeof userData.ranking === 'number'
              ? userData.ranking.toFixed(1)
              : 'Unrated',
        };
      }
      return {
        id: userId,
        displayName: 'User',
        photoURL: smileDefault,
        rating: 'Unrated',
      };
    } catch (err) {
      console.error('Error fetching requester details:', err.message);
      return {
        id: userId,
        displayName: 'User',
        photoURL: smileDefault,
        rating: 'Unrated',
      };
    }
  };

  // Fetch requester details when event requests change
  useEffect(() => {
    const fetchRequesters = async () => {
      const requesterPromises = event?.requests?.map(async (userId) => {
        const userDetails = await fetchRequesterDetails(userId);
        return { userId, ...userDetails };
      });
      const resolvedRequesters = await Promise.all(requesterPromises || []);
      setRequesters(resolvedRequesters);
    };
    fetchRequesters();
  }, [event?.requests]);

  // Long press message handler
  const handleLongPressMessage = (message) => {
    setSelectedUser({ id: message.senderId, type: 'message', message });
    setIsReportModalVisible(true);
  };

  // Long press attendee handler (improved cross-platform options)
  const openAttendeeOptions = (attendee) => {
    if (!attendee) return;
    // Host removal / report options
    if (isCreator) {
      Alert.alert(attendee.displayName || 'Attendee', 'Choose an action', [
        {
          text: 'View Profile',
          onPress: () => {
            setIsModalVisible(false);
            navigation.navigate('OtherUserProfile', { userId: attendee.id });
          },
        },
        {
          text: 'Remove From Event',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Confirm Removal',
              'Remove this attendee? They will lose chat access.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => handleRemoveUser(attendee.id),
                },
              ]
            ),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      // Non-host: open report modal (reuse existing)
      setSelectedUser({ id: attendee.id, type: 'attendee', attendee });
      setIsReportModalVisible(true);
    }
  };

  // Remove user from event
  const handleRemoveUser = async (userId) => {
    if (isSoftDeleted || ended) {
      Alert.alert(
        'Action unavailable',
        'Cannot remove attendees from archived or ended events.'
      );
      return;
    }
    if (!userId || !eventId) return;
    if (userId === event?.ownerId) {
      Alert.alert('You cannot remove the host of the event.');
      return;
    }
    try {
      const eventRef = doc(db, 'events', eventId);
      // Description: Atomically remove user from event attendees
      await updateDoc(eventRef, { attendees: arrayRemove(userId) });

      // Description: Remove event reference from user's attended / attending arrays
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        attendedEvents: arrayRemove(eventId),
        attendingEvents: arrayRemove(eventId), // legacy field support
      }).catch(() => {}); // swallow if fields missing

      // Optional: system message (could be used later for audit trail)
      // await addDoc(collection(db, 'chats', eventId, 'messages'), {
      //   text: 'A user was removed by the host.',
      //   senderId: 'system',
      //   createdAt: new Date(),
      // });

      // Local optimistic update; snapshot will reconcile
      setAttendees((prev) => prev.filter((a) => a.id !== userId));
      Alert.alert('Removed', 'User removed from event.');
      setIsReportModalVisible(false);
    } catch (err) {
      console.error('Error removing user:', err.message);
      Alert.alert('Removal Failed', 'Could not remove user. Try again.');
    }
  };

  // Description: Allow a non-host attendee to leave the event (removes from event + user doc)
  const handleLeaveEvent = async () => {
    if (isSoftDeleted || ended) {
      Alert.alert(
        'Action unavailable',
        'Cannot modify attendance for archived or ended events.'
      );
      return;
    }
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || !eventId) return;
    if (isCreator) return; // Creator uses delete flow instead

    Alert.alert(
      'Leave Event',
      'Are you sure you want to leave this event? You will lose access to the chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              // Proactively stop listeners to avoid permission-denied errors during transition
              try {
                eventUnsubRef.current && eventUnsubRef.current();
              } catch {}
              try {
                messagesUnsubRef.current && messagesUnsubRef.current();
              } catch {}
              eventUnsubRef.current = null;
              messagesUnsubRef.current = null;

              const functions = getFunctions(getApp(), 'us-central1');
              const leave = httpsCallable(functions, 'leaveEvent');
              await leave({ eventId });

              // Optimistic local updates
              setAttendees((prev) => prev.filter((a) => a.id !== currentUid));
              setEvent((prev) =>
                prev
                  ? {
                      ...prev,
                      attendees: (prev.attendees || []).filter(
                        (id) => id !== currentUid
                      ),
                    }
                  : prev
              );

              // Navigate back out of chat
              setIsModalVisible(false);
              navigation.goBack();
            } catch (err) {
              console.error('Leave event error:', err);
              const code = err?.code || '';
              let msg = err?.message || 'Could not leave the event.';
              if (code.includes('unauthenticated')) msg = 'Please sign in.';
              else if (code.includes('permission') || code.includes('denied'))
                msg = "You don't have permission to leave this event.";
              else if (code.includes('not-found')) msg = 'Event not found.';
              Alert.alert('Leave Failed', msg);
            }
          },
        },
      ]
    );
  };

  // Report submit handler
  const handleReportSubmit = (reportDetails) => {
    // Description: Submit report logic
    const targetUserId = reportDetails?.userId || selectedUser?.id || null;
    const reason = reportDetails?.reason || 'No reason provided';
    if (!auth?.currentUser?.uid || !targetUserId) {
      setIsReportModalVisible(false);
      return;
    }
    reportContent(auth.currentUser.uid, targetUserId, 'user', reason, {
      details: `Report from chat of event ${eventId}`,
      context: { eventId },
    })
      .then(() => {
        console.log('Report submitted:', reportDetails);
      })
      .catch((e) => {
        console.error('Report failed:', e?.message || e);
      })
      .finally(() => setIsReportModalVisible(false));
  };

  if (loading || !event) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff' }}
      edges={['top', 'left', 'right']}
    >
      {/* Header placed below SafeAreaView padding */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name='arrow-back' size={24} color='#007AFF' />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsModalVisible(true)}>
            <Text style={styles.headerTitle}>
              {event?.title || 'Event Chat'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsModalVisible(true)}>
            <Text style={styles.ellipsis}>⋯</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Archived / Ended banner */}
      {(isSoftDeleted || ended) && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {isSoftDeleted
              ? 'This event has been archived. Chat is read-only.'
              : archived
              ? 'This event ended over 3 days ago. Chat is read-only.'
              : 'This event has ended. Chat remains open for 3 days.'}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Chat Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSystem =
              item?.senderId === 'system' || item?.type === 'system';
            if (isSystem) {
              return (
                <View style={styles.systemContainer}>
                  <Text style={styles.systemText}>
                    {item?.text || 'System update'}
                  </Text>
                </View>
              );
            }

            const isHost = item.senderId === event?.ownerId;
            const sender =
              isHost && hostUser
                ? {
                    id: event.ownerId,
                    displayName: hostUser.displayName,
                    photoURL: hostUser.photoURL,
                  }
                : attendees.find((a) => a.id === item.senderId);
            const isCurrentUser = item.senderId === auth.currentUser?.uid;
            const displayName =
              sender?.displayName || (isHost ? 'Host' : 'User');
            return (
              <View
                style={{
                  flexDirection: isCurrentUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  marginVertical: 6,
                  marginHorizontal: 10,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    navigation.navigate('OtherUserProfile', {
                      userId:
                        sender?.id || (isHost ? event?.ownerId : undefined),
                    });
                  }}
                  onLongPress={() => handleLongPressMessage(item)}
                >
                  <Image
                    source={
                      sender?.photoURL ? { uri: sender.photoURL } : smileDefault // Fallback to default image
                    }
                    style={[
                      styles.messageAvatar,
                      isHost && styles.hostAvatarBorder,
                    ]}
                  />
                </TouchableOpacity>
                <View
                  style={{
                    maxWidth: '75%',
                    alignItems: isCurrentUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      navigation.navigate('OtherUserProfile', {
                        userId:
                          sender?.id || (isHost ? event?.ownerId : undefined),
                      });
                    }}
                    onLongPress={() => handleLongPressMessage(item)}
                  >
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Text style={styles.senderName}>{displayName}</Text>
                      {isHost && <Text style={styles.hostChip}>HOST</Text>}
                    </View>
                  </TouchableOpacity>
                  <View
                    style={[
                      styles.messageBubble,
                      {
                        backgroundColor: isCurrentUser ? '#3B82F6' : '#F97316',
                      },
                    ]}
                  >
                    <Text style={{ color: '#fff' }}>{item.text}</Text>
                  </View>
                </View>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: 10 }}
        />

        {/* Message Input */}
        {isAttendee || isCreator ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={
                isSoftDeleted
                  ? 'Event archived — chat read-only'
                  : archived
                  ? 'Chat archived — read-only'
                  : ended
                  ? 'Event ended — chat open for 3 days'
                  : 'Type a message...'
              }
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => {
                if (!readOnly) sendMessage();
              }}
              editable={!readOnly}
              returnKeyType='send'
            />
            <TouchableOpacity
              onPress={sendMessage}
              style={[
                styles.sendButton,
                (readOnly || !(input || '').trim()) && {
                  opacity: 0.5,
                },
              ]}
              disabled={readOnly || !(input || '').trim()}
            >
              <Text style={styles.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#888' }}>
              {isSoftDeleted
                ? 'This event has been archived. Chat is read-only.'
                : ended
                ? 'This event has ended.'
                : 'Only attendees or the event creator can chat in this event.'}
            </Text>
          </View>
        )}

        {/* Event Info Modal */}
        <Modal
          isVisible={isModalVisible}
          onBackdropPress={() => setIsModalVisible(false)}
          onSwipeComplete={() => setIsModalVisible(false)}
          swipeDirection='down'
          style={styles.modal}
          backdropOpacity={0.4}
        >
          <ScrollView
            style={[
              styles.modalContent,
              { paddingBottom: (insets.bottom || 0) + 32 }, // Ensure bottom actions are above home indicator / nav bar
            ]}
            contentContainerStyle={{ paddingBottom: (insets.bottom || 0) + 32 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.dragHandle} />

            {/* Event Title + Host Info */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={hostUser ? 0.7 : 1}
              onPress={() => {
                // Description: Consistent profile navigation logic + close modal after navigation
                const ownerId = event?.ownerId;
                if (hostUser && ownerId) {
                  setIsModalVisible(false);
                  if (ownerId === auth.currentUser?.uid) {
                    // Navigate to the main Profile tab
                    navigation.reset({
                      index: 0,
                      routes: [
                        {
                          name: 'MainTabs',
                          params: { screen: 'ProfileStack' },
                        },
                      ],
                    });
                  } else {
                    navigation.navigate('OtherUserProfile', {
                      userId: ownerId,
                    });
                  }
                }
              }}
            >
              <Text style={styles.cardTitle}>{event?.title}</Text>
              {hostUser && (
                <View style={styles.hostRow}>
                  <Image
                    source={
                      hostUser?.photoURL
                        ? { uri: hostUser.photoURL }
                        : smileDefault // Fallback to default image
                    }
                    style={styles.hostAvatar}
                  />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.hostName}>
                      Host: {hostUser.displayName}
                    </Text>
                    <Text style={styles.hostRating}>
                      {typeof hostUser.rating === 'number'
                        ? `⭐ Rating: ${hostUser.rating.toFixed(1)} `
                        : 'Rating: Unrated'}
                    </Text>
                  </View>
                </View>
              )}
              {!hostUser && (
                <View style={styles.hostRow}>
                  <Image source={smileDefault} style={styles.hostAvatar} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.hostName}>Host: User</Text>
                    <Text style={styles.hostRating}>Rating: Unrated</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>

            {/* Location */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Location</Text>
              <TouchableOpacity
                onPress={() => {
                  if (
                    resolvedLocationLabel &&
                    resolvedLocationLabel !== 'Location not available'
                  ) {
                    Linking.openURL(
                      `https://maps.google.com/?q=${encodeURIComponent(
                        resolvedLocationLabel
                      )}`
                    );
                  }
                }}
              >
                <Text style={styles.linkText}>{resolvedLocationLabel}</Text>
              </TouchableOpacity>
            </View>

            {/* Date & Time */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Date & Time</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.normalText}>
                  {/* Description: Robust date formatting for Firestore Timestamp or JS Date */}
                  {event?.date
                    ? new Date(event.date.seconds * 1000).toLocaleString(
                        'en-US',
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )
                    : 'Date not specified'}
                </Text>
                <TouchableOpacity
                  onPress={() => console.log('Add to calendar')}
                >
                  <Text style={styles.linkText}>Add to Calendar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Description */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text
                style={styles.normalText}
                numberOfLines={isDescriptionExpanded ? undefined : 3}
              >
                {event?.description || 'No description provided.'}
              </Text>
              {event?.description?.length > 120 && ( // Show toggle only if long enough
                <TouchableOpacity
                  onPress={() =>
                    setIsDescriptionExpanded(!isDescriptionExpanded)
                  }
                >
                  <Text style={styles.linkText}>
                    {isDescriptionExpanded ? 'Show Less' : 'Show More'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Attendees */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Attendees</Text>
              <FlatList
                data={attendees.slice(0, 10)}
                horizontal
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ alignItems: 'center', marginRight: 12 }}
                    onPress={() => {
                      setIsModalVisible(false);
                      navigation.navigate('OtherUserProfile', {
                        userId: item.id,
                      });
                    }}
                    onLongPress={() => openAttendeeOptions(item)}
                    delayLongPress={350}
                  >
                    <Image
                      source={
                        item.photoURL ? { uri: item.photoURL } : smileDefault // Fallback to default image
                      }
                      style={styles.attendeeImage}
                    />
                    <Text style={styles.attendeeName}>
                      {item.displayName?.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                )}
                showsHorizontalScrollIndicator={false}
              />

              {attendees.length > 10 && (
                <TouchableOpacity
                  onPress={() => console.log('Navigate to full attendee list')}
                >
                  <Text style={styles.linkText}>
                    View All ({attendees.length})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Requests Section */}
            {event.ownerId === auth.currentUser?.uid && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Requests</Text>
                {requesters.length > 0 ? (
                  requesters.map((requester) => (
                    <TouchableOpacity
                      key={requester.userId}
                      style={styles.requestItem}
                      onPress={() => {
                        setIsModalVisible(false);
                        navigation.navigate('OtherUserProfile', {
                          userId: requester.userId,
                        });
                      }}
                    >
                      <Image
                        source={
                          requester.photoURL
                            ? { uri: requester.photoURL }
                            : smileDefault // Fallback to default image
                        }
                        style={styles.requestAvatar}
                      />
                      <View style={styles.requestDetails}>
                        <Text style={styles.requestName}>
                          {requester.displayName}
                        </Text>
                        <Text style={styles.requestRating}>
                          Rating: {requester.rating}
                        </Text>
                      </View>
                      <View style={styles.requestActions}>
                        <TouchableOpacity
                          style={styles.acceptButton}
                          onPress={() => handleAcceptRequest(requester.userId)}
                        >
                          <Text style={styles.acceptButtonText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.declineButton}
                          onPress={() => handleDeclineRequest(requester.userId)}
                        >
                          <Text style={styles.declineButtonText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.emptyText}>
                    No requests at the moment.
                  </Text>
                )}
              </View>
            )}

            {/* Actions */}
            <TouchableOpacity
              style={styles.leaveButton}
              onPress={() => {
                if (isCreator) {
                  Alert.alert(
                    'Delete Event',
                    'Are you sure you want to delete this event? This action cannot be undone.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                          // Description: Delete event from Firestore
                          // const eventRef = doc(db, 'events', eventId);
                          // deleteDoc(eventRef)
                          //   .then(() => {
                          //     navigation.goBack();
                          //     Alert.alert(
                          //       'Event Deleted',
                          //       'The event has been deleted.'
                          //     );
                          //   })
                          //   .catch((error) => {
                          //     console.error('Error deleting event:', error);
                          //     Alert.alert(
                          //       'Error',
                          //       'Failed to delete the event.'
                          //     );
                          //   });

                          // Soft delete flow
                          deleteEvent(eventId, auth.currentUser.uid)
                            .then(() => {
                              navigation.goBack();
                              Alert.alert(
                                'Event Deleted',
                                'The event has been deleted.'
                              );
                            })
                            .catch((error) => {
                              console.error('Error deleting event:', error);
                              Alert.alert(
                                'Error',
                                'Failed to delete the event.'
                              );
                            });
                        },
                      },
                    ]
                  );
                } else {
                  handleLeaveEvent();
                }
              }}
            >
              <Text style={styles.leaveButtonText}>
                {isCreator ? 'Delete Event' : 'Leave Event'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => console.log('Report Event')}
            >
              <Text style={styles.reportButtonText}>Report Event</Text>
            </TouchableOpacity>
          </ScrollView>
        </Modal>

        {/* Report Modal */}
        <ReportModal
          isVisible={isReportModalVisible}
          onClose={() => setIsReportModalVisible(false)}
          onSubmit={handleReportSubmit}
          user={selectedUser}
          isCreator={isCreator}
          onRemove={handleRemoveUser}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  messageAvatar: {
    width: 45,
    height: 45,
    borderRadius: 10,
    marginHorizontal: 6,
    backgroundColor: '#eee',
  },
  hostAvatarBorder: {
    borderWidth: 2,
    borderColor: '#8B5CF6', // purple border for host
  },
  senderName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  hostChip: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#8B5CF6',
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    overflow: 'hidden',
  },
  systemContainer: {
    alignSelf: 'center',
    backgroundColor: '#EFEFEF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginVertical: 6,
  },
  systemText: {
    color: '#666',
    fontSize: 12,
  },
  messageBubble: {
    borderRadius: 20, // pill/oval shape
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
    padding: 8,
    marginBottom: 25,
    borderTopWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    height: 40,
  },
  sendButton: { marginLeft: 8, justifyContent: 'center' },
  sendText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16 },

  // Modal
  modal: { justifyContent: 'flex-end', margin: 0, flex: 1 },
  modalContent: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '95%', // Slightly taller & allow internal padding to show last button
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 20, fontWeight: 'bold' },
  sectionTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  linkText: { color: '#007AFF', fontSize: 15 },
  normalText: { fontSize: 15, color: '#333' },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attendeeImage: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#eee',
    marginBottom: 4,
  },
  attendeeName: { fontSize: 12, color: '#333' },
  leaveButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  leaveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  reportButton: {
    backgroundColor: '#F2F2F2',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#ccc',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  hostAvatar: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#eee',
  },
  hostName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  hostRating: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  headerContainer: {
    // Description: Ensures header is below SafeAreaView top padding
    backgroundColor: '#fff',
    paddingTop: 6,
    paddingBottom: 2,
    elevation: 2,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  backText: { fontSize: 16, color: '#007AFF' },
  headerTitle: { fontWeight: 'bold', fontSize: 16 },
  ellipsis: { fontSize: 24, color: '#888' },

  // Requests Section Styles
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  requestAvatar: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 3,
    backgroundColor: '#eee',
  },
  requestDetails: {
    flex: 1,
    marginLeft: 10,
  },
  requestName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  requestRating: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'column', // Change to column for stacking
    alignItems: 'center',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  declineButton: {
    backgroundColor: '#F44336',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  declineButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  banner: {
    backgroundColor: '#FFEB3B',
    padding: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#FFD54F',
  },
  bannerText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
});

export default EventChatScreen;
