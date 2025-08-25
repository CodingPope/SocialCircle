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
import Avatar from '../../components/ui/Avatar';
import PopupMenu from './PopupMenu';
import { useUserStore } from '../profile/userStore';
import { useEventStore } from './eventStore';
import {
  deleteEvent,
  reportContent,
  db,
  updateUserData,
} from '../../firebase/config';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { Video } from 'expo-video';
import joinEvent from './joinEvent';
import { trackCardClick, trackReportContent } from '../../lib/analytics';

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

  // Track local requested state for immediate UI feedback on RSVP requests
  const [requestedLocal, setRequestedLocal] = useState(false);

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
      await reportContent(
        user.uid,
        event.id,
        'event',
        'Inappropriate content',
        {
          details: `Auto-report from PostCard for event ${event.id}`,
          context: { eventId: event.id },
        }
      );
      try {
        trackReportContent({
          content_type: 'event',
          content_id: event.id,
          reason_category: 'inappropriate',
          event_id: event.id,
          surface: 'discover',
        });
      } catch {}
      alert('Thanks for the report. Our team will review it shortly.');
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

  // Helper: compute age from a possible Firestore Timestamp or Date
  const getUserAge = useCallback((dob) => {
    if (!dob) return null;
    let d = null;
    try {
      if (dob?.toDate) d = dob.toDate();
      else if (typeof dob?.seconds === 'number')
        d = new Date(dob.seconds * 1000);
      else if (dob instanceof Date) d = dob;
      else if (typeof dob === 'string') d = new Date(dob);
    } catch {}
    if (!d || isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  }, []);

  // Checks: gender/age/privacy eligibility before attempting any join
  const getJoinEligibility = useCallback(() => {
    const privacy = (event?.privacy || 'public').toString().toLowerCase();
    const userSex = (user?.sex || user?.gender || '').toString().toLowerCase();

    // Gender-only privacy
    if (privacy === 'female-only' && userSex !== 'female') {
      return { ok: false, reason: 'This event is for women only.' };
    }
    if (privacy === 'male-only' && userSex !== 'male') {
      return { ok: false, reason: 'This event is for men only.' };
    }

    // Age range check
    const range = Array.isArray(event?.ageRange) ? event.ageRange : null;
    if (range && range.length === 2) {
      const [min, max] = range.map((n) =>
        typeof n === 'number' ? n : parseInt(n, 10)
      );
      const age = getUserAge(user?.dob);
      if (typeof age !== 'number') {
        return {
          ok: false,
          reason:
            'Add your birthday in profile to request/join age-restricted events.',
        };
      }
      if (
        (typeof min === 'number' && age < min) ||
        (typeof max === 'number' && age > max)
      ) {
        return {
          ok: false,
          reason: `This event is restricted to ages ${min}-${max}.`,
        };
      }
    }

    return { ok: true };
  }, [
    event?.privacy,
    event?.ageRange,
    user?.sex,
    user?.gender,
    user?.dob,
    getUserAge,
  ]);

  // Helper: compute event end time in ms (prefer endAt, fallback to date + 1h)
  const getEventEndMs = useCallback((e) => {
    if (!e) return null;
    let end = null;
    if (e.endAt) {
      if (e.endAt.toDate) end = e.endAt.toDate().getTime();
      else if (typeof e.endAt.seconds === 'number')
        end = e.endAt.seconds * 1000;
    } else if (e.date) {
      if (e.date.toDate) end = e.date.toDate().getTime();
      else if (typeof e.date.seconds === 'number') end = e.date.seconds * 1000;
      else if (e.date instanceof Date) end = e.date.getTime();
      if (end) end += 60 * 60 * 1000; // assume 1h duration when only start exists
    }
    return end;
  }, []);

  const endMs = useMemo(
    () => getEventEndMs(event),
    [event?.id, event?.date, event?.endAt, getEventEndMs]
  );
  const archived = useMemo(
    () =>
      typeof endMs === 'number'
        ? Date.now() >= endMs + 3 * 24 * 60 * 60 * 1000
        : false,
    [endMs]
  );

  // Description: Join event handler (unified)
  const handleJoin = useCallback(async () => {
    if (!user || !event?.id) return;

    const onShowMessage = (msg) => msg && alert(msg);

    const res = await joinEvent({
      event,
      user,
      // Use helper navigation for joined; don't pass navigation here
      navigation: null,
      stores: { eventStore: useEventStore.getState() },
      options: { onShowMessage },
    });

    // If owner or already-attending, open chat using onPress contract
    if (res?.status === 'owner' || res?.status === 'already-attending') {
      onPress?.(event, 'EventChatScreen');
    }

    // Reflect local requested/requested UI quickly
    if (res?.status === 'requested') {
      setRequestedLocal(true);
    }
  }, [event, user, onPress]);

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
    const lat = event?.location?.latitude;
    const lng = event?.location?.longitude;
    if (!event?.address && lat && lng) {
      const fetchAddress = async () => {
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
          );
          const data = await res.json();
          if (data.status === 'OK' && data.results.length) {
            const next = data.results[0].formatted_address;
            setResolvedAddress((prev) => (prev === next ? prev : next));
          } else {
            setResolvedAddress('Address not available');
          }
        } catch {
          setResolvedAddress('Error fetching address');
        }
      };
      fetchAddress();
    }
  }, [
    event?.address,
    event?.location?.latitude,
    event?.location?.longitude,
    GOOGLE_MAPS_API_KEY,
  ]);

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

  // Member check for label/behavior
  const isMember = useMemo(() => {
    const uid = user?.uid;
    if (!uid) return false;
    if (event?.ownerId === uid) return true;
    return Array.isArray(event?.attendees) && event.attendees.includes(uid);
  }, [event?.ownerId, event?.attendees, user?.uid]);

  // Has pending request (server or locally just sent)
  const hasRequested = useMemo(() => {
    const uid = user?.uid;
    const already = Array.isArray(event?.requests)
      ? event.requests.includes(uid)
      : false;
    return requestedLocal || already;
  }, [event?.requests, user?.uid, requestedLocal]);

  // Derived UI state for button label and disabled styling
  const privacy = (event?.privacy || 'public').toString().toLowerCase();
  const isReadOnly = isSoftDeleted || archived;
  const buttonLabel = isMember
    ? 'Check Chat'
    : privacy === 'rsvp'
    ? hasRequested
      ? 'Requested'
      : 'Request'
    : 'Join';

  // Disable only when:
  // - RSVP already requested (non-member), or
  // - Non-member on archived/soft-deleted event (cannot join),
  // Members stay enabled to open chat even in read-only
  const joinDisabled =
    (privacy === 'rsvp' && hasRequested) || (!isMember && isReadOnly);

  return (
    <Animated.View
      style={{ opacity: fadeAnim, transform: [{ scale: fadeAnim }] }}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          try {
            trackCardClick({
              card_type: 'event',
              card_id: event.id,
              surface: 'discover',
            });
          } catch {}
          onPress?.(event);
        }}
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
              <AttendeeBubbleRow
                attendees={event.attendees}
                snippets={event.attendeeSnippets || null}
                countOverride={
                  typeof event.attendeesCount === 'number'
                    ? event.attendeesCount
                    : null
                }
              />
            ) : (
              <Text style={styles.noAttendeesText}>No attendees yet</Text>
            )}
          </View>
          <View style={styles.actionRight}>
            <TouchableOpacity
              style={[
                styles.joinButton,
                (joinDisabled || (isMember && isReadOnly)) &&
                  styles.joinButtonDisabled,
              ]}
              onPress={handleJoin}
              disabled={joinDisabled}
            >
              <Text
                style={[
                  styles.joinText,
                  (joinDisabled || (isMember && isReadOnly)) &&
                    styles.joinTextDisabled,
                ]}
              >
                {buttonLabel}
              </Text>
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
            targetType='event'
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
  joinButtonDisabled: {
    backgroundColor: '#C9CCD1', // dull/grey when disabled
  },
  joinText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  joinTextDisabled: {
    color: '#f2f2f2',
  },
});
