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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
} from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import smileDefault from '../../../assets/smileDefault.png';

const EventChatScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { eventId, locationName: locationNameParam } = route.params;
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [hostUser, setHostUser] = useState(null);
  const flatListRef = useRef(null);

  // Fetch event info + attendees
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'events', eventId), async (snap) => {
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
              `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
              'User',
            photoURL:
              userData.photoURL ||
              userData.profileImage ||
              userData.avatarURL ||
              null,
          };
        });
        const attendeeData = await Promise.all(attendeePromises);
        setAttendees(attendeeData);
      } else {
        setAttendees([]);
      }
    });
    return unsub;
  }, [eventId]);

  // Fetch chat messages
  useEffect(() => {
    const q = query(
      collection(db, 'chats', eventId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    return unsub;
  }, [eventId]);

  // Fetch host user info when event changes
  useEffect(() => {
    // Description: Support both hostId and ownerId for event creator
    const hostId = event?.hostId || event?.ownerId;
    if (hostId) {
      getDoc(doc(db, 'users', hostId)).then((userDoc) => {
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setHostUser({
            displayName:
              userData.displayName ||
              `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
              'User',
            photoURL:
              userData.photoURL ||
              userData.profileImage ||
              userData.avatarURL ||
              null,
            ranking:
              typeof userData.ranking === 'number' ? userData.ranking : null,
          });
        } else {
          setHostUser(null);
        }
      });
    } else {
      setHostUser(null);
    }
  }, [event?.hostId, event?.ownerId]);

  // Send message
  const sendMessage = async () => {
    if (!input.trim()) return;
    await addDoc(collection(db, 'chats', eventId, 'messages'), {
      text: input,
      senderId: auth.currentUser?.uid,
      createdAt: new Date(),
    });
    setInput('');
  };

  // Check if current user is attendee
  const isAttendee =
    Array.isArray(event?.attendees) &&
    event.attendees.includes(auth.currentUser?.uid);

  // Check if current user is event creator (support both ownerId and hostId)
  const isCreator =
    event?.ownerId === auth.currentUser?.uid ||
    event?.hostId === auth.currentUser?.uid;

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
            <Text style={styles.backText}>Back</Text>
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
            const sender = attendees.find((a) => a.id === item.senderId);
            const isCurrentUser = item.senderId === auth.currentUser?.uid;
            return (
              <View
                style={{
                  flexDirection: isCurrentUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  marginVertical: 6,
                  marginHorizontal: 10,
                }}
              >
                <Image
                  source={
                    sender?.photoURL ? { uri: sender.photoURL } : smileDefault
                  }
                  style={styles.messageAvatar}
                />
                <View
                  style={{
                    maxWidth: '75%',
                    alignItems: isCurrentUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Text style={styles.senderName}>
                    {sender?.displayName || 'User'}
                  </Text>
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
              placeholder='Type a message...'
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              returnKeyType='send'
            />
            <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
              <Text style={styles.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#888' }}>
              Only attendees or the event creator can chat in this event.
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
            style={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.dragHandle} />

            {/* Event Title + Host Info */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={hostUser ? 0.7 : 1}
              onPress={() => {
                // Description: Consistent profile navigation logic + close modal after navigation
                const hostId = event?.hostId || event?.ownerId;
                if (hostUser && hostId) {
                  setIsModalVisible(false);
                  if (hostId === auth.currentUser?.uid) {
                    // Navigate to the main Profile tab
                    navigation.navigate('MainTabs', { screen: 'ProfileStack' });
                  } else {
                    navigation.navigate('OtherUserProfile', { userId: hostId });
                  }
                }
              }}
            >
              <Text style={styles.cardTitle}>{event?.title}</Text>
              {hostUser && (
                <View style={styles.hostRow}>
                  <Image
                    source={
                      hostUser.photoURL
                        ? { uri: hostUser.photoURL }
                        : smileDefault
                    }
                    style={styles.hostAvatar}
                  />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.hostName}>
                      Host: {hostUser.displayName}
                    </Text>
                    <Text style={styles.hostRanking}>
                      {typeof hostUser.ranking === 'number'
                        ? `Ranking: ${hostUser.ranking.toFixed(1)} ⭐`
                        : 'Ranking: Unrated'}
                    </Text>
                  </View>
                </View>
              )}
              {!hostUser && (
                <View style={styles.hostRow}>
                  <Image source={smileDefault} style={styles.hostAvatar} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.hostName}>Host: User</Text>
                    <Text style={styles.hostRanking}>Ranking: Unrated</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>

            {/* Location */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Location</Text>
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(
                    `https://maps.google.com/?q=${
                      locationNameParam || event?.locationName || 'Location'
                    }`
                  )
                }
              >
                <Text style={styles.linkText}>
                  {locationNameParam ||
                    event?.locationName ||
                    'Location not available'}
                </Text>
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
                data={attendees.slice(0, 10)} // Show only first 10
                horizontal
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={{ alignItems: 'center', marginRight: 12 }}>
                    <Image
                      source={
                        item.photoURL ? { uri: item.photoURL } : smileDefault
                      }
                      style={styles.attendeeImage}
                    />
                    <Text style={styles.attendeeName}>
                      {item.displayName?.split(' ')[0]}
                    </Text>
                  </View>
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

            {/* Actions */}
            <TouchableOpacity
              style={styles.leaveButton}
              onPress={() => console.log('Leave Event')}
            >
              <Text style={styles.leaveButtonText}>Leave Event</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => console.log('Report Event')}
            >
              <Text style={styles.reportButtonText}>Report Event</Text>
            </TouchableOpacity>
          </ScrollView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  messageAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginHorizontal: 6,
    backgroundColor: '#eee',
  },
  senderName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  messageBubble: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
    padding: 8,
    marginBottom: 10,
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
  modal: { justifyContent: 'flex-end', margin: 0 },
  modalContent: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
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
    borderRadius: 25,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eee',
  },
  hostName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  hostRanking: {
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
});

export default EventChatScreen;
