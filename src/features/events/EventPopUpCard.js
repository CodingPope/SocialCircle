import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Linking,
} from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { useNavigation } from '@react-navigation/native';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  collection,
  addDoc,
  onSnapshot, // NEW: live updates for event doc
} from 'firebase/firestore';
// Do NOT import addDoc directly here; use sendNotification from config.js which handles notification creation
import {
  db,
  updateUserData,
  functions,
  reportContent,
} from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '../profile/userStore';
import { useEventStore } from './eventStore';
import { useUserSnippetStore } from '../profile/userSnippetStore';
import joinEvent from './joinEvent';
import {
  trackOpenEvent,
  trackReportContent,
  trackShareEvent,
  trackSaveEvent,
} from '../../lib/analytics';

const screenHeight = Dimensions.get('window').height;

export default function EventPopUpCard({
  event,
  onClose,
  onJoin,
  source = 'other',
  surface = 'event_detail',
}) {
  const bottomSheetRef = useRef(null);
  // Description: Get current user from Zustand userStore
  const user = useUserStore((state) => state.user);
  const navigation = useNavigation();
  const [address, setAddress] = useState('Fetching address...');
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [userDetails, setUserDetails] = useState(null);
  const snapPoints = useMemo(() => ['50%', '90%', '95%'], []);
  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);

  // NEW: Keep a live copy of the event document
  const [liveEvent, setLiveEvent] = useState(event || null);
  const openedForIdRef = useRef(null);

  // Sync local when prop id changes (open from a different card)
  useEffect(() => {
    setLiveEvent(event || null);
  }, [event?.id]);

  // Subscribe to Firestore event updates to reflect RSVP/attendee changes instantly
  useEffect(() => {
    if (!event?.id) return;
    const ref = doc(db, 'events', event.id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          onClose && onClose();
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setLiveEvent((prev) => {
          // Skip update if nothing meaningful changed to avoid cascading renders
          if (
            prev &&
            prev.id === data.id &&
            prev.updatedAt?.seconds === data.updatedAt?.seconds
          ) {
            return prev;
          }
          return data;
        });
        // Auto-close if soft-deleted
        if (data.isDeleted === true) onClose && onClose();
      },
      (err) => console.error('EventPopUpCard snapshot error:', err)
    );
    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, [event?.id, onClose]);

  useEffect(() => {
    if (!liveEvent || liveEvent.isDeleted) {
      onClose && onClose();
      return;
    }

    if (!liveEvent?.location) {
      setAddress('Location not specified');
    } else {
      const fetchAddress = async () => {
        try {
          const { latitude, longitude } = liveEvent.location;
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
          );
          const data = await res.json();
          if (data.status === 'OK' && data.results.length) {
            const next = data.results[0].formatted_address;
            setAddress((prev) => (prev === next ? prev : next));
          } else {
            setAddress('Address not available');
          }
        } catch (err) {
          setAddress('Error fetching address');
        }
      };
      fetchAddress();
    }

    const ownerId = liveEvent.ownerId;
    if (!ownerId) return;

    // Prefer cached/batched snippet over per-doc get
    const fetchHostSnippet = async () => {
      try {
        const map = await ensureSnippets([ownerId]);
        const s = map.get(ownerId);
        if (s)
          setUserDetails((prev) => {
            if (
              prev &&
              prev.id === ownerId &&
              prev.photoURL === s.photoURL &&
              prev.name === s.name
            )
              return prev;
            return { id: ownerId, ...s };
          });
        else setUserDetails(null);
      } catch (err) {
        // Fallback to direct get as last resort to preserve behavior
        try {
          const ref = doc(db, 'users', ownerId);
          const snap = await getDoc(ref);
          if (snap.exists()) setUserDetails({ id: snap.id, ...snap.data() });
        } catch (err2) {
          console.error('Error fetching user details:', err2);
          setUserDetails(null);
        }
      }
    };
    fetchHostSnippet();
  }, [
    liveEvent?.id,
    liveEvent?.location?.latitude,
    liveEvent?.location?.longitude,
    liveEvent?.ownerId,
  ]);

  const isSoftDeleted = liveEvent?.isDeleted === true;
  const isExpired = (() => {
    const e = liveEvent;
    if (!e) return false;
    let eventTime = null;
    if (e.endAt) {
      if (e.endAt.toDate) eventTime = e.endAt.toDate().getTime();
      else if (e.endAt.seconds) eventTime = e.endAt.seconds * 1000;
    } else if (e.date) {
      if (e.date.toDate) eventTime = e.date.toDate().getTime();
      else if (e.date.seconds) eventTime = e.date.seconds * 1000;
      else if (e.date instanceof Date) eventTime = e.date.getTime();
    }
    if (!eventTime) return false;
    return eventTime + 60 * 60 * 1000 <= Date.now();
  })();

  const displayName =
    userDetails?.name ||
    (userDetails
      ? `${userDetails.firstName || ''} ${userDetails.lastName || ''}`.trim() ||
        userDetails.name ||
        'Anonymous'
      : 'Anonymous');

  // Use fallback image for event image
  const profileImageSource = userDetails?.photoURL
    ? { uri: userDetails.photoURL }
    : userDetails?.profileImage || userDetails?.avatarURL
    ? { uri: userDetails.profileImage || userDetails.avatarURL }
    : require('../../../assets/smileDefault.png');

  const openInMaps = () => {
    if (liveEvent?.location) {
      const { latitude, longitude } = liveEvent.location;
      Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`);
    }
  };

  // --- Join Event Logic ---
  // Track local request state to instantly reflect UI after sending a request
  const [requestPendingLocal, setRequestPendingLocal] = useState(false);

  // --- Live derived state ---
  const attendees = Array.isArray(liveEvent?.attendees)
    ? liveEvent.attendees
    : [];
  const requests = Array.isArray(liveEvent?.requests) ? liveEvent.requests : [];
  const isOwner = liveEvent?.ownerId === user?.uid;
  const isAttendee = attendees.includes(user?.uid);
  const isMember = isOwner || isAttendee;
  const hasRequested =
    (requests.includes(user?.uid) || requestPendingLocal) && !isMember;

  // Compute archived (read-only) state: >3 days after end, or soft-deleted
  const getEventEndMs = (e) => {
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
  };
  const endMs = useMemo(
    () => getEventEndMs(liveEvent),
    [liveEvent?.id, liveEvent?.date, liveEvent?.endAt]
  );
  const archived = useMemo(
    () =>
      typeof endMs === 'number'
        ? Date.now() >= endMs + 3 * 24 * 60 * 60 * 1000
        : false,
    [endMs]
  );
  const isReadOnly = isSoftDeleted || archived;

  // --- Join/Request/Chat Button Logic ---
  let actionButtonLabel = 'Join Event';
  if (isMember) {
    actionButtonLabel = 'Check Chat';
  } else if ((liveEvent?.privacy || 'public') === 'rsvp') {
    actionButtonLabel = hasRequested ? 'Requested' : 'Request To Join';
  }

  // Disable only when:
  // - RSVP already requested (non-member), or
  // - Non-member and view-only (archived/soft-deleted)
  const joinDisabled =
    !isMember &&
    (isReadOnly ||
      ((liveEvent?.privacy || 'public') === 'rsvp' && hasRequested));

  // --- Button Action Handler ---
  const handleActionButton = async () => {
    if (!user || !liveEvent?.id) return;

    const onShowMessage = (msg) => msg && alert(msg);

    const res = await joinEvent({
      event: liveEvent,
      user,
      navigation, // allow helper to navigate to chat on join
      stores: { eventStore: useEventStore.getState() },
      options: { onShowMessage },
    });

    if (res?.status === 'owner' || res?.status === 'already-attending') {
      // helper would navigate, but keep address param behavior consistent
      navigation.navigate('EventChat', {
        eventId: liveEvent.id,
        locationName: address,
      });
      return;
    }
    if (res?.status === 'requested') {
      setRequestPendingLocal(true);
    }
  };

  const handleReport = async () => {
    if (!user || !liveEvent?.id) return;
    try {
      await reportContent(
        user.uid,
        liveEvent.id,
        'event',
        'Inappropriate or unsafe content',
        {
          details: `Auto-report from EventPopUpCard for event ${liveEvent.id}`,
          context: { eventId: liveEvent.id },
        }
      );
      try {
        trackReportContent({
          content_type: 'event',
          content_id: liveEvent.id,
          reason_category: 'inappropriate',
          event_id: liveEvent.id,
          surface: 'event_detail',
        });
      } catch {}
      alert('Thanks for the report. Our team will review it shortly.');
    } catch (err) {
      console.error('Report error:', err);
      alert('Failed to report the event. Please try again.');
    }
  };

  // TODO: Add Save/Share buttons here when feature ships.
  // Example usage:
  // onSaveToggle = (saved) => trackSaveEvent({ event_id: liveEvent.id, surface: 'event_detail', saved });
  // onShare = (channel) => trackShareEvent({ event_id: liveEvent.id, channel, surface: 'event_detail' });

  // Fire open_event once when this popup first shows a given event id
  useEffect(() => {
    if (!liveEvent?.id) return;
    if (openedForIdRef.current === liveEvent.id) return;
    openedForIdRef.current = liveEvent.id;
    try {
      trackOpenEvent({
        event_id: liveEvent.id,
        source,
        surface,
        interest: liveEvent?.interest,
        category: liveEvent?.category,
      });
    } catch {}
  }, [
    liveEvent?.id,
    source,
    surface,
    liveEvent?.interest,
    liveEvent?.category,
  ]);

  if (!liveEvent) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior='close'
        />
      )}
      style={[styles.bottomSheet, { maxHeight: screenHeight }]}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={{ padding: 10, flexGrow: 1 }}
      >
        {/* TODO: Insert Save/Share action row near the top image/title when feature ships */}
        {(liveEvent.imageUri || liveEvent.imageUrl) && (
          <Image
            source={{ uri: liveEvent.imageUri || liveEvent.imageUrl }}
            style={styles.image}
            resizeMode='cover'
          />
        )}
        <Text style={styles.title}>{liveEvent.title || 'Untitled Event'}</Text>
        {liveEvent.category && (
          <Text style={styles.categoryTag}>{liveEvent.category}</Text>
        )}

        <Text style={styles.label}>Description:</Text>
        <Text style={styles.description}>
          {showFullDescription
            ? liveEvent.description
            : liveEvent.description?.length > 300
            ? `${liveEvent.description.slice(0, 300)}...`
            : liveEvent.description}
        </Text>
        {liveEvent.description && liveEvent.description.length > 300 && (
          <TouchableOpacity
            onPress={() => setShowFullDescription(!showFullDescription)}
          >
            <Text style={styles.showMore}>
              {showFullDescription ? 'Read Less' : 'Read More'}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.label}>Date:</Text>
        <Text style={styles.subText}>
          {liveEvent.date
            ? new Date(liveEvent.date.seconds * 1000).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Date not specified'}
        </Text>
        <Text style={styles.label}>Address:</Text>
        <TouchableOpacity style={styles.addressContainer} onPress={openInMaps}>
          <Ionicons name='pin' size={20} color='blue' />
          <Text style={[styles.subText, { color: 'blue' }]}>{address}</Text>
        </TouchableOpacity>

        {userDetails && (
          <TouchableOpacity
            style={styles.userContainer}
            onPress={() => {
              if (userDetails.id === user?.uid) {
                navigation.navigate('MainTabs', { screen: 'ProfileStack' });
              } else {
                navigation.navigate('OtherUserProfile', {
                  userId: userDetails.id,
                });
              }
            }}
          >
            <Image source={profileImageSource} style={styles.userImage} />
            <View>
              <Text style={styles.userName}>{displayName}</Text>
              <Text style={styles.userRating}>
                {typeof userDetails.rating === 'number' &&
                userDetails.rating > 0
                  ? `⭐ ${Number(userDetails.rating).toFixed(1)}`
                  : 'No Rating'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.actionsContainer}>
          {typeof liveEvent.capacity === 'number' && liveEvent.capacity > 0 ? (
            <Text style={styles.capacityText}>
              {attendees.length} / {liveEvent.capacity} Joined
            </Text>
          ) : (
            <Text style={styles.capacityText}>{attendees.length} joined</Text>
          )}
          <TouchableOpacity
            style={[
              styles.joinButton,
              (joinDisabled || (isMember && isReadOnly)) &&
                styles.joinButtonDisabled,
            ]}
            onPress={handleActionButton}
            disabled={joinDisabled}
          >
            <Text
              style={[
                styles.joinButtonText,
                (joinDisabled || (isMember && isReadOnly)) &&
                  styles.joinButtonTextDisabled,
              ]}
            >
              {actionButtonLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportButton} onPress={handleReport}>
            <Text style={styles.reportButtonText}>Report</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 100, // Ensure BottomSheet overlays FABs
    elevation: 100, // For Android overlay
  },

  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 10,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 10,
  },
  placeholderText: { fontSize: 16, color: '#888' },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  categoryTag: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: { fontSize: 14, color: '#333', fontWeight: 'bold', marginBottom: 4 },
  description: { fontSize: 14, color: '#555', marginBottom: 12 },
  showMore: {
    color: 'blue',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  subText: { fontSize: 14, color: '#666', marginBottom: 8 },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  userContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  userImage: { width: 40, height: 40, borderRadius: 10, marginRight: 8 },
  userName: { fontSize: 16, fontWeight: 'bold' },
  userRating: {
    fontSize: 14,
    color: '#FFB300', // Description: Gold color to match PostCard rating star
    fontWeight: '600',
    marginTop: 2,
  },
  actionsContainer: {
    flexDirection: 'column', // Stack buttons vertically
    marginTop: 16,
  },
  joinButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 8,
  },
  joinButtonDisabled: {
    backgroundColor: '#C9CCD1', // dull/grey when disabled for requested or read-only state
  },
  joinButtonText: { color: '#fff', fontWeight: 'bold' },
  joinButtonTextDisabled: { color: '#f2f2f2' },
  reportButton: {
    backgroundColor: '#FFB300',
    padding: 8,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 8,
  },
  reportButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  secondaryActionsContainer: {
    flexDirection: 'row', // Place cancel and share buttons side by side
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  shareIconButton: {
    padding: 6,
    borderRadius: 5,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  capacityText: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: 'bold',
    marginBottom: 8,
  },
});
