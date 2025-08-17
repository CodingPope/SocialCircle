import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
} from 'react-native';
import AttendeeBubbleRow from './AttendeeBubbleRow';
import { MaterialIcons } from '@expo/vector-icons';
import Avatar from './ui/Avatar';
import PopupMenu from './PopupMenu';
import { useUserStore } from '../store/userStore';
import { useEventStore } from '../store/eventStore';
import {
  deleteEvent,
  reportContent,
  db,
  updateUserData,
} from '../firebase/config';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { Video } from 'expo-video';

export default function PostCard({ event, onPress, onJoinPress }) {
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const [menuVisible, setMenuVisible] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState(
    event.address || 'Fetching address...'
  );
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseTimeoutRef = useRef(null);

  // Derived: soft-delete and expiry checks to control UI (fix ReferenceError)
  const isSoftDeleted = event?.isDeleted === true;
  const isExpired = (() => {
    if (!event) return false;
    let eventTime = null;
    if (event.endAt) {
      if (event.endAt.toDate) eventTime = event.endAt.toDate().getTime();
      else if (event.endAt.seconds) eventTime = event.endAt.seconds * 1000;
    } else if (event.date) {
      if (event.date.toDate) eventTime = event.date.toDate().getTime();
      else if (event.date.seconds) eventTime = event.date.seconds * 1000;
      else if (event.date instanceof Date) eventTime = event.date.getTime();
    }
    if (!eventTime) return false;
    return eventTime + 60 * 60 * 1000 <= Date.now();
  })();

  // Description: Fade in animation for card
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Description: Memoized owner check
  const isOwner = useMemo(
    () => event.ownerId === user?.uid,
    [event.ownerId, user?.uid]
  );

  // Description: Show menu
  const handleEllipsisPress = useCallback(() => setMenuVisible(true), []);

  // Description: Delete event handler
  const handleDelete = useCallback(async () => {
    setMenuVisible(false);
    try {
      await deleteEvent(event.id, user.uid);
      alert('Event deleted successfully.');
    } catch (error) {
      alert('Failed to delete the event. Please try again.');
    }
  }, [event.id, user.uid]);

  // Description: Report event handler
  const handleReport = useCallback(async () => {
    setMenuVisible(false);
    try {
      await reportContent(user.uid, event.id, 'event', 'Inappropriate content');
      alert('Event reported successfully.');
    } catch (error) {
      alert('Failed to report the event. Please try again.');
    }
  }, [event.id, user.uid]);

  // Friendly callable error message mapper
  const getFriendlyJoinError = useCallback((err) => {
    const code = err?.code || '';
    const msg = (err?.message || '').replace(/^Functions error: /, '');
    if (code.includes('unauthenticated'))
      return 'Please sign in to join this event.';
    if (code.includes('invalid-argument'))
      return 'Invalid request. Please update the app and try again.';
    if (code.includes('not-found')) return 'This event no longer exists.';
    if (code.includes('permission-denied'))
      return "You don't have permission to perform this action.";
    if (code.includes('failed-precondition'))
      return msg || 'Event is full. You can join the waitlist if available.';
    return msg || 'Failed to join event. Please try again.';
  }, []);

  // Description: Join event handler
  const handleJoin = useCallback(async () => {
    if (isSoftDeleted) {
      alert('This event has been archived and cannot be joined.');
      return;
    }
    if (isExpired) {
      alert('This event has ended and cannot be joined.');
      return;
    }
    if (!user || !event?.id) return;
    const isOwnerLocal = event.ownerId === user.uid;
    const attendeesLocal = Array.isArray(event.attendees)
      ? event.attendees
      : [];
    const isAttendeeLocal = attendeesLocal.includes(user.uid);

    if (isAttendeeLocal || isOwnerLocal) {
      onPress?.(event, 'EventChatScreen');
      return;
    }

    // If event is full
    if (
      typeof event.capacity === 'number' &&
      event.capacity > 0 &&
      attendeesLocal.length >= event.capacity
    ) {
      alert('Event is full. You can join the waitlist if available.');
      return;
    }

    try {
      // Use centralized eventStore.rsvpEvent (preferred)
      const rsvpFn = useEventStore.getState().rsvpEvent;
      if (typeof rsvpFn === 'function') {
        await rsvpFn(event.id, user.uid);
        // Navigate to chat
        onPress?.(event, 'EventChatScreen');
        return;
      }
      throw new Error('RSVP function unavailable');
    } catch (e) {
      console.error('rsvp via store failed', e);
      alert(getFriendlyJoinError(e));
    }

    // Note: removed direct client-side Firestore update fallback to enforce centralized callable flow
  }, [event, user, isSoftDeleted, isExpired, onPress, getFriendlyJoinError]);

  // Description: Memoized derived values
  const attendeesCount = useMemo(
    () => event.attendees?.length || 0,
    [event.attendees]
  );
  const spotsLeft = useMemo(
    () =>
      event.capacity ? Math.max(event.capacity - attendeesCount, 0) : null,
    [event.capacity, attendeesCount]
  );
  const fillPercent = useMemo(
    () => (event.capacity ? attendeesCount / event.capacity : 0),
    [event.capacity, attendeesCount]
  );
  const eventDateTime = useMemo(
    () =>
      event.date?.seconds
        ? new Date(event.date.seconds * 1000).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
          })
        : 'Date TBD',
    [event.date]
  );

  // Description: Fetch address if not present
  useEffect(() => {
    if (
      !event.address &&
      event.location?.latitude &&
      event.location?.longitude
    ) {
      const fetchAddress = async () => {
        try {
          const { latitude, longitude } = event.location;
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
          );
          const data = await res.json();
          if (data.status === 'OK' && data.results.length) {
            setResolvedAddress(data.results[0].formatted_address);
          } else {
            setResolvedAddress('Address not available');
          }
        } catch {
          setResolvedAddress('Error fetching address');
        }
      };
      fetchAddress();
    }
  }, [event.address, event.location, GOOGLE_MAPS_API_KEY]);

  // Description: RSVP badge pulse animation for low spots
  useEffect(() => {
    if (spotsLeft !== null && spotsLeft <= 3) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      pulseTimeoutRef.current = setTimeout(() => {
        animation.stop();
      }, 5000);
    }
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, [spotsLeft, pulseAnim]);

  // Description: Truncate address for display
  const MAX_ADDRESS_LENGTH = 30;
  const truncatedAddress = useMemo(
    () =>
      resolvedAddress.length > MAX_ADDRESS_LENGTH
        ? `${resolvedAddress.slice(0, MAX_ADDRESS_LENGTH)}...`
        : resolvedAddress,
    [resolvedAddress]
  );

  // Description: RSVP badge style and text color
  // RSVP badge background and text color separation
  const getRSVPBgStyle = useCallback(() => {
    if (fillPercent >= 1) return styles.rsvpFull;
    if (fillPercent >= 0.5) return styles.rsvpHigh;
    if (fillPercent >= 0.25) return styles.rsvpMid;
    return styles.rsvpLow;
  }, [fillPercent]);

  const getRSVPTextColor = useCallback(() => {
    if (fillPercent >= 1) return styles.rsvpTextFull;
    if (fillPercent >= 0.5) return styles.rsvpTextHigh;
    if (fillPercent >= 0.25) return styles.rsvpTextMid;
    return styles.rsvpTextLow;
  }, [fillPercent]);

  return (
    <Animated.View
      style={{ opacity: fadeAnim, transform: [{ scale: fadeAnim }] }}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={() => onPress?.(event)}
        activeOpacity={0.9}
      >
        {(event.videoUrl || event.imageUrl) &&
          (event.videoUrl ? (
            <Video
              source={{ uri: event.videoUrl }}
              style={styles.media}
              resizeMode='cover'
              isMuted
              shouldPlay={false}
              isLooping
            />
          ) : (
            <Image source={{ uri: event.imageUrl }} style={styles.media} />
          ))}

        <View style={styles.info}>
          <TouchableOpacity
            style={styles.ellipsisButtonAbsolute}
            onPress={handleEllipsisPress}
          >
            <MaterialIcons name='more-vert' size={24} color='#888' />
          </TouchableOpacity>
          <Text style={styles.title}>{event.title}</Text>
          <View style={styles.hostRow}>
            <Avatar uri={event.hostPhoto} size={50} />
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.hostName}>{event.hostName}</Text>
              <Text style={styles.rating}>
                {event.hostRating
                  ? `⭐ ${event.hostRating.toFixed(1)}`
                  : 'No Rating'}
              </Text>
              <Text style={styles.dateTime}>{eventDateTime}</Text>
              <Text
                style={styles.location}
                numberOfLines={1}
                ellipsizeMode='tail'
              >
                {truncatedAddress}
              </Text>
            </View>
          </View>

          <View style={styles.bubbleRow}>
            <View style={styles.interestBubble}>
              <Text style={styles.interestText}>
                {event.interest || 'General'}
              </Text>
            </View>

            <Animated.View
              style={[
                styles.attendeeBadge,
                { transform: [{ scale: pulseAnim }] },
                getRSVPBgStyle(), // Only backgroundColor here
              ]}
            >
              <Text style={[styles.attendeesText, getRSVPTextColor()]}>
                {attendeesCount > 0
                  ? `${attendeesCount} ${
                      attendeesCount === 1 ? 'person joined' : 'people joined'
                    }`
                  : 'Be the first to join'}
              </Text>
            </Animated.View>

            {event.isRSVP && typeof event.capacity === 'number' && (
              <Text style={styles.capacityText}>
                {typeof spotsLeft === 'number' && spotsLeft > 0
                  ? `⏳ ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`
                  : '🚫 Event Full'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actionRow}>
          <View style={styles.actionLeft}>
            {Array.isArray(event.attendees) && attendeesCount > 0 ? (
              <AttendeeBubbleRow attendees={event.attendees} />
            ) : (
              <Text style={styles.noAttendeesText}>No attendees yet</Text>
            )}
          </View>
          <View style={styles.actionRight}>
            <TouchableOpacity style={styles.joinButton} onPress={handleJoin}>
              <Text style={styles.joinText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>

        {menuVisible && (
          <PopupMenu
            visible={menuVisible}
            onClose={() => setMenuVisible(false)}
            isOwner={isOwner}
            onReport={handleReport}
            onDelete={handleDelete}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 14,
    marginTop: 6,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  media: {
    width: '100%',
    height: 250,
  },
  info: {
    padding: 14,
  },
  ellipsisButtonAbsolute: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    padding: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    marginRight: 40,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  hostName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  rating: {
    fontSize: 13,
    color: '#FFB300',
    fontWeight: '600',
  },
  dateTime: {
    fontSize: 14,
    color: '#555',
  },
  location: {
    fontSize: 13,
    color: '#007AFF',
  },
  bubbleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 6,
    rowGap: 4,
    alignItems: 'center',
    marginTop: 6,
  },
  interestBubble: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  interestText: {
    fontSize: 12,
    color: '#555',
  },
  attendeeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  attendeesText: {
    fontSize: 13,
    fontWeight: '700',
  },
  rsvpLow: {
    backgroundColor: '#FFF3F4',
  },
  rsvpMid: {
    backgroundColor: '#FFFBE6',
  },
  rsvpHigh: {
    backgroundColor: '#FFF5F0',
  },
  rsvpFull: {
    backgroundColor: '#FFE6EC',
  },
  rsvpTextLow: {
    color: '#D72638',
  },
  rsvpTextMid: {
    color: '#D48C00',
  },
  rsvpTextHigh: {
    color: '#D46400',
  },
  rsvpTextFull: {
    color: '#C2185B',
  },
  capacityText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  noAttendeesText: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
    marginLeft: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: 40,
  },
  actionRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  joinButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  joinText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
