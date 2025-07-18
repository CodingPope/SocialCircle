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
} from 'react-native';
import { useRoute } from '@react-navigation/native';
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
import smileDefault from '../../../assets/smileDefault.png'; // Import the default image

const EventChatScreen = () => {
  const route = useRoute();
  const { eventId } = route.params;
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef(null);

  // Fetch event info + attendees
  useEffect(() => {
    // Description: Listen for event changes and fetch attendee user data from Firestore
    const unsub = onSnapshot(doc(db, 'events', eventId), async (snap) => {
      const data = snap.data();
      setEvent(data);
      if (data?.attendees?.length) {
        // Description: For each attendee UID, fetch user data from 'users' collection
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
        setAttendees(attendeeData); // attendeeData: [{ id, photoURL, displayName, ... }]
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
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100
      );
    });
    return unsub;
  }, [eventId]);

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

  // Utility: get attendees array from event object
  const getAttendeeUids = (eventObj) =>
    Array.isArray(eventObj?.attendees) ? eventObj.attendees : [];

  if (loading || !event || !auth.currentUser?.uid) {
    // Show spinner until event and user are loaded
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  // Always use event.attendees for permission checks
  const isAttendee = getAttendeeUids(event).includes(auth.currentUser.uid);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 12,
          borderBottomWidth: 1,
          borderColor: '#eee',
        }}
      >
        <Text style={{ fontWeight: 'bold', fontSize: 18 }}>Event Chat</Text>
        <TouchableOpacity>
          <Text style={{ fontSize: 24, color: '#888' }}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* Event Info & Attendees */}
      <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
        <Text style={{ fontWeight: 'bold', fontSize: 18 }}>
          {event?.title || 'Event Chat'}
        </Text>
        <Text style={{ color: '#888', marginBottom: 4 }}>
          {event?.locationName}
        </Text>
        <FlatList
          data={attendees}
          horizontal
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={{ alignItems: 'center', marginRight: 12 }}>
              <Image
                source={item.photoURL ? { uri: item.photoURL } : smileDefault}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#eee',
                }}
              />
              <Text style={{ fontSize: 12 }}>
                {item.displayName ? item.displayName.split(' ')[0] : 'User'}
              </Text>
            </View>
          )}
          style={{ marginVertical: 4 }}
          showsHorizontalScrollIndicator={false}
        />
      </View>

      {/* Chat Messages & Input */}
      <View style={{ flex: 1 }}>
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
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    marginHorizontal: 6,
                  }}
                />
                <View
                  style={{
                    maxWidth: '75%',
                    alignItems: isCurrentUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: 'bold',
                      color: '#000',
                      marginBottom: 2,
                    }}
                  >
                    {/* Defensive: always show displayName if available */}
                    {sender?.displayName || 'User'}
                  </Text>
                  <View
                    style={{
                      backgroundColor: isCurrentUser ? '#DCF8C6' : '#F1F0F0',
                      borderRadius: 16,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text>{item.text}</Text>
                  </View>
                </View>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: 70 }} // Reserve space for input
        />

        {/* Message Input */}
        {isAttendee ? (
          <View
            style={{
              flexDirection: 'row',
              padding: 8,
              borderTopWidth: 1,
              borderColor: '#eee',
              backgroundColor: '#fafafa',
            }}
          >
            <TextInput
              style={{
                flex: 1,
                borderRadius: 20,
                backgroundColor: '#f0f0f0',
                paddingHorizontal: 16,
                height: 40,
              }}
              placeholder='Type a message...'
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              returnKeyType='send'
            />
            <TouchableOpacity
              onPress={sendMessage}
              style={{ marginLeft: 8, justifyContent: 'center' }}
            >
              <Text
                style={{ color: '#007AFF', fontWeight: 'bold', fontSize: 16 }}
              >
                Send
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#888' }}>
              Only attendees can chat in this event.
            </Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

export default EventChatScreen;
