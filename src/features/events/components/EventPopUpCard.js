import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { useNavigation } from '@react-navigation/native';
import {
  doc,
  getDoc,
  onSnapshot, // live updates for event doc
} from '../../../services/firebase/firestoreCompat';
import { db, reportContent } from '../../../services/firebase/config';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '../../profile/stores/userStore';
import { useEventStore } from '../stores/eventStore';
import { useUserSnippetStore } from '../../profile/stores/userSnippetStore';
import joinEvent from '../api/joinEventService';
import { trackOpenEvent, trackReportContent } from '../../../lib/analytics';
import { navigateToOtherUserProfile } from '../../../navigation/RootNavigation';
import { shareEventDetails } from '../utils/shareUtils';
import { getBlockContext, isEventVisibleForUser } from '../utils/blockUtils';
import {
  saveEventForUser,
  removeSavedEventForUser,
} from '../api/savedEventsService';
import { useSavedEventsStore } from '../stores/savedEventsStore';
import {
  trackSaveEvent,
  AnalyticsSurfaces,
  AnalyticsSources,
} from '../../../lib/analytics';
import { useTheme } from '../../../theme';
import { useThemeStore } from '../../../store/themeStore';

const screenHeight = Dimensions.get('window').height;
// Clearance in pixels reserved at the top of the scroll content for the floating handle
const HANDLE_CLEARANCE = 28;

export default function EventPopUpCard({
  event,
  onClose,
  onJoin,
  source = 'other',
  surface = 'event_detail',
}) {
  const bottomSheetRef = useRef(null);
  const user = useUserStore((state) => state.user);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const themeMode = useThemeStore((state) => state.mode);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const blockContext = useMemo(
    () => getBlockContext(user),
    [user?.uid, user?.blocked, user?.blockedBy]
  );

  const [address, setAddress] = useState('Fetching address...');
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [userDetails, setUserDetails] = useState(null);
  const joinFeedbackTimeoutRef = useRef(null);
  const lastJoinMessageRef = useRef(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [optimisticAttendeeDelta, setOptimisticAttendeeDelta] = useState(0);
  const optimisticEventIdRef = useRef(null);

  const snapPoints = useMemo(() => {
    const topOffsetPercent = Math.min(
      6,
      Math.round((insets.top / screenHeight) * 100)
    );
    return ['92%', '60%', `${98 - topOffsetPercent}%`];
  }, [insets.top]);

  const ensureSnippets = useUserSnippetStore((s) => s.ensureSnippets);

  // Live event doc
  const [liveEvent, setLiveEvent] = useState(event || null);
  const openedForIdRef = useRef(null);
  const activeEventId = liveEvent?.id || event?.id || null;
  const isEventSaved = useSavedEventsStore((state) =>
    activeEventId ? !!state.savedMap[activeEventId] : false
  );

  useEffect(() => {
    setLiveEvent(event || null);
  }, [event?.id]);

  useEffect(() => {
    if (!liveEvent || !liveEvent.ownerId) return;
    if (!isEventVisibleForUser(liveEvent, blockContext)) {
      Alert.alert(
        'Event unavailable',
        'You no longer have access to this event.'
      );
      onClose && onClose();
    }
  }, [blockContext, liveEvent?.id, liveEvent?.ownerId, onClose]);

  useEffect(() => {
    if (joinFeedbackTimeoutRef.current) {
      clearTimeout(joinFeedbackTimeoutRef.current);
      joinFeedbackTimeoutRef.current = null;
    }
    setJoinFeedback(null);
    setJoinLoading(false);
    lastJoinMessageRef.current = null;
    optimisticEventIdRef.current = null;
    setOptimisticAttendeeDelta(0);
  }, [liveEvent?.id]);

  useEffect(() => {
    return () => {
      if (joinFeedbackTimeoutRef.current) {
        clearTimeout(joinFeedbackTimeoutRef.current);
        joinFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  const showJoinFeedback = useCallback((payload) => {
    const normalized =
      typeof payload === 'string'
        ? { message: payload, tone: 'info' }
        : payload && typeof payload === 'object'
        ? {
            message: payload.message || '',
            tone: payload.tone || 'info',
          }
        : null;

    if (!normalized || !normalized.message) return;

    if (joinFeedbackTimeoutRef.current) {
      clearTimeout(joinFeedbackTimeoutRef.current);
      joinFeedbackTimeoutRef.current = null;
    }

    setJoinFeedback(normalized);

    joinFeedbackTimeoutRef.current = setTimeout(() => {
      setJoinFeedback(null);
      joinFeedbackTimeoutRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    if (!event?.id) return;
    const ref = doc(db, 'events', event.id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists) {
          onClose && onClose();
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setLiveEvent((prev) => {
          if (
            prev &&
            prev.id === data.id &&
            prev.updatedAt?.seconds === data.updatedAt?.seconds
          ) {
            return prev;
          }
          return data;
        });
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

    // address
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

    // host snippet
    const ownerId = liveEvent.ownerId;
    if (!ownerId) return;
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
        try {
          const ref = doc(db, 'users', ownerId);
          const snap = await getDoc(ref);
          if (snap.exists) setUserDetails({ id: snap.id, ...snap.data() });
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
    onClose,
  ]);

  const isSoftDeleted = liveEvent?.isDeleted === true;

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

  // derived state
  const attendees = Array.isArray(liveEvent?.attendees)
    ? liveEvent.attendees
    : [];
  const attendeeCountDisplay =
    attendees.length +
    (optimisticEventIdRef.current === liveEvent?.id
      ? optimisticAttendeeDelta
      : 0);
  const requests = Array.isArray(liveEvent?.requests) ? liveEvent.requests : [];
  const isOwner = liveEvent?.ownerId === user?.uid;
  const isAttendee = attendees.includes(user?.uid);
  const isMember = isOwner || isAttendee;
  const [requestPendingLocal, setRequestPendingLocal] = useState(false);
  const hasRequested =
    (requests.includes(user?.uid) || requestPendingLocal) && !isMember;

  let actionButtonLabel = 'Join Event';
  if (isMember) {
    actionButtonLabel = 'Check Chat';
  } else if ((liveEvent?.privacy || 'public') === 'rsvp') {
    actionButtonLabel = hasRequested ? 'Requested' : 'Request To Join';
  }

  const joinDisabled =
    !isMember &&
    (isReadOnly ||
      ((liveEvent?.privacy || 'public') === 'rsvp' && hasRequested));
  const buttonDisabled = joinDisabled || joinLoading;
  const showDisabledStyle =
    buttonDisabled || (isMember && isReadOnly && !joinLoading);

  const FloatingHandle = () => (
    <View style={styles.handleWrap}>
      <View style={styles.handlePill} />
    </View>
  );

  const resetOptimisticJoin = useCallback(() => {
    optimisticEventIdRef.current = null;
    setOptimisticAttendeeDelta(0);
  }, []);

  const verifyMembershipAndNavigate = useCallback(
    async (fallbackMessage = null) => {
      if (!liveEvent?.id || !user?.uid) return false;
      try {
        const snap = await getDoc(doc(db, 'events', liveEvent.id));
        if (snap.exists()) {
          const data = snap.data();
          const attendeeList = Array.isArray(data?.attendees)
            ? data.attendees
            : [];
          const isMemberNow =
            data?.ownerId === user.uid ||
            data?.hostId === user.uid ||
            attendeeList.includes(user.uid);
          if (isMemberNow) {
            onClose && onClose();
            setTimeout(() => {
              navigation.navigate('EventChat', {
                eventId: liveEvent.id,
                locationName: address,
              });
            }, 50);
            return true;
          }
        }
        showJoinFeedback({
          message:
            fallbackMessage ||
            'Join is processing. Please try again in a moment.',
          tone: 'info',
        });
        return false;
      } catch (err) {
        console.error('[EventPopUpCard] membership verify failed:', err);
        showJoinFeedback({
          message:
            fallbackMessage ||
            'Unable to open chat right now. Please try again shortly.',
          tone: 'error',
        });
        return false;
      } finally {
        resetOptimisticJoin();
      }
    },
    [
      address,
      liveEvent?.id,
      navigation,
      onClose,
      resetOptimisticJoin,
      showJoinFeedback,
      user?.uid,
    ]
  );

  const handleActionButton = useCallback(async () => {
    if (!user || !liveEvent?.id || joinLoading) return;

    setJoinLoading(true);
    lastJoinMessageRef.current = null;

    const privacyMode = (liveEvent?.privacy || 'public').toLowerCase();
    const capacityRemaining =
      typeof liveEvent?.capacity === 'number'
        ? liveEvent.capacity - attendees.length
        : null;
    const canOptimisticallyJoin =
      !isMember &&
      privacyMode === 'public' &&
      !isReadOnly &&
      (capacityRemaining === null || capacityRemaining > 0);

    if (canOptimisticallyJoin) {
      optimisticEventIdRef.current = liveEvent.id;
      setOptimisticAttendeeDelta(1);
    }

    try {
      const res = await joinEvent({
        event: liveEvent,
        user,
        navigation,
        stores: { eventStore: useEventStore.getState() },
        options: {
          onShowMessage: (msg) => {
            if (typeof msg === 'string') {
              lastJoinMessageRef.current = msg;
            }
          },
        },
      });

      const capturedMessage = lastJoinMessageRef.current;
      lastJoinMessageRef.current = null;

      if (res?.status === 'owner' || res?.status === 'already-attending') {
        await verifyMembershipAndNavigate(
          capturedMessage || res?.message || 'Opening chat...'
        );
        return;
      }

      if (res?.status === 'joined') {
        await verifyMembershipAndNavigate(
          capturedMessage || res?.message || 'Opening chat...'
        );
        return;
      }

      if (res?.status === 'requested') {
        setRequestPendingLocal(true);
        showJoinFeedback({
          message:
            res?.message ||
            capturedMessage ||
            'Request sent. We will notify you once the host responds.',
          tone: 'success',
        });
        resetOptimisticJoin();
        return;
      }

      if (res?.status === 'waitlisted') {
        showJoinFeedback({
          message:
            res?.message ||
            capturedMessage ||
            'Added to the waitlist. We will reach out if a spot opens.',
          tone: 'info',
        });
        resetOptimisticJoin();
        return;
      }

      const fallbackMessage = capturedMessage || res?.message;
      if (fallbackMessage) {
        showJoinFeedback({
          message: fallbackMessage,
          tone:
            res?.status === 'error' || res?.status === 'denied'
              ? 'error'
              : 'info',
        });
      }
    } catch (err) {
      console.error('[EventPopUpCard] join failed:', err);
      showJoinFeedback({
        message: err?.message || 'Join failed. Please try again.',
        tone: 'error',
      });
    } finally {
      resetOptimisticJoin();
      setJoinLoading(false);
    }
  }, [
    user,
    liveEvent,
    joinLoading,
    navigation,
    address,
    onClose,
    showJoinFeedback,
    attendees.length,
    isMember,
    isReadOnly,
    verifyMembershipAndNavigate,
    resetOptimisticJoin,
  ]);

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

  // analytics
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

  const displayName =
    userDetails?.name ||
    (userDetails
      ? `${userDetails.firstName || ''} ${userDetails.lastName || ''}`.trim() ||
        userDetails.name ||
        'Anonymous'
      : 'Anonymous');

  const profileImageSource = userDetails?.photoURL
    ? { uri: userDetails.photoURL }
    : userDetails?.profileImage || userDetails?.avatarURL
    ? { uri: userDetails.profileImage || userDetails.avatarURL }
    : require('../../../../assets/smileDefault.png');

  const handleToggleSave = useCallback(async () => {
    if (!activeEventId) return;
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Log in to save events for later.');
      return;
    }

    // Description: Prevent users from saving their own events
    if (isOwner) {
      Alert.alert(
        'Cannot save your own event',
        'You can always find your events in the My Circle tab under "Your Upcoming Events".'
      );
      return;
    }

    if (saveBusy) return;

    setSaveBusy(true);
    const targetSaved = !isEventSaved;
    try {
      if (isEventSaved) {
        await removeSavedEventForUser({
          userId: user.uid,
          eventId: activeEventId,
        });
      } else {
        await saveEventForUser({
          userId: user.uid,
          event: liveEvent || event,
          surface,
          source,
        });
      }

      trackSaveEvent({
        event_id: activeEventId,
        surface: surface || AnalyticsSurfaces.EVENT_DETAIL,
        source: source || AnalyticsSources.OTHER,
        saved: targetSaved,
        interest: liveEvent?.interest || event?.interest || null,
        category: liveEvent?.category || event?.category || null,
      });
    } catch (err) {
      Alert.alert(
        'Save failed',
        err?.message || 'Unable to update your saved events right now.'
      );
    } finally {
      setSaveBusy(false);
    }
  }, [
    activeEventId,
    event,
    isEventSaved,
    isOwner,
    liveEvent,
    saveBusy,
    source,
    surface,
    user?.uid,
  ]);

  const openInMaps = () => {
    if (!liveEvent?.location) return;
    const { latitude, longitude } = liveEvent.location;
    Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`);
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      index={0}
      enablePanDownToClose
      enableOverDrag={false}
      topInset={0}
      style={styles.bottomSheet}
      backgroundStyle={styles.sheetBackground}
      handleComponent={FloatingHandle}
      onClose={() => onClose && onClose()}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior='close'
        />
      )}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={{
          paddingTop: HANDLE_CLEARANCE,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 16),
          flexGrow: 1,
        }}
      >
        {/* Full-bleed header image */}
        {typeof liveEvent.imageUrl === 'string' && liveEvent.imageUrl && (
          <View style={styles.headerFullBleed}>
            <Image
              source={{ uri: liveEvent.imageUrl }}
              style={styles.headerImage}
              resizeMode='cover'
            />
          </View>
        )}

        {/* Title + share */}
        <View style={styles.titleRow}>
          <Text
            style={styles.title}
            numberOfLines={2}
            ellipsizeMode={'tail'}
          >
            {liveEvent.title || 'Untitled Event'}
          </Text>
          <View style={styles.titleActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleToggleSave}
              disabled={saveBusy || !activeEventId}
              accessibilityRole='button'
              accessibilityLabel={
                isEventSaved ? 'Remove from saved events' : 'Save event'
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {saveBusy ? (
                <ActivityIndicator size='small' color='#2563EB' />
              ) : (
                <Ionicons
                  name={isEventSaved ? 'bookmark' : 'bookmark-outline'}
                  size={22}
                  color={isEventSaved ? '#2563EB' : '#2563EB'}
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() =>
                shareEventDetails(liveEvent, {
                  surface,
                  source: source || 'event_detail_popover',
                })
              }
              accessibilityRole='button'
              accessibilityLabel='Share event'
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name='share-social-outline' size={22} color='#2563EB' />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.metaRow}>
          {!!liveEvent?.privacy && (
            <View
              style={[
                styles.chip,
                (liveEvent.privacy || 'public') === 'rsvp' && styles.chipWarn,
              ]}
            >
              <Ionicons
                name={
                  (liveEvent.privacy || 'public') === 'rsvp'
                    ? 'lock-closed'
                    : 'people'
                }
                size={14}
                color='#111827'
              />
              <Text style={styles.chipText}>
                {(liveEvent.privacy || 'public').toUpperCase()}
              </Text>
            </View>
          )}

          {typeof liveEvent.capacity === 'number' && (
            <View style={styles.chip}>
              <Ionicons name='person-add' size={14} color='#111827' />
              <Text style={styles.chipText}>
                {attendeeCountDisplay}/{liveEvent.capacity}
              </Text>
            </View>
          )}

          {!!liveEvent?.interest && (
            <View style={styles.chip}>
              <Ionicons name='pricetag' size={14} color='#111827' />
              <Text style={styles.chipText}>{liveEvent.interest}</Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Description */}
        <Text style={styles.sectionLabel}>Description</Text>
        <Text style={styles.bodyText}>
          {showFullDescription
            ? liveEvent.description
            : liveEvent.description?.length > 300
            ? `${liveEvent.description.slice(0, 300)}...`
            : liveEvent.description || 'No description'}
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

        <View style={styles.divider} />

        {/* When */}
        <Text style={styles.sectionLabel}>When</Text>
        <Text style={styles.bodyText}>
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

        {/* Where */}
        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Where</Text>
        <TouchableOpacity
          style={styles.inlineButton}
          onPress={openInMaps}
          accessibilityRole='button'
          accessibilityLabel='Open in maps'
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name='pin' size={18} color='#2563EB' />
          <Text style={styles.linkText}>{address}</Text>
        </TouchableOpacity>

        {/* Host card */}
        {userDetails && (
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.hostCard}
            onPress={() => {
              // Close the popup and navigate to the host profile
              onClose && onClose();
              if (userDetails.id === user?.uid) {
                setTimeout(() => {
                  navigation.navigate('MainTabs', { screen: 'ProfileStack' });
                }, 50);
              } else {
                setTimeout(() => {
                  navigateToOtherUserProfile(userDetails.id);
                }, 50);
              }
            }}
          >
            <Image source={profileImageSource} style={styles.hostAvatar} />
            <View style={{ flex: 1 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Text style={styles.hostName}>{displayName}</Text>
                {userDetails?.verification?.status === 'verified' && (
                  <Ionicons name='checkmark-circle' size={16} color='#2563EB' />
                )}
              </View>
              <Text style={styles.hostSub}>
                {typeof userDetails.rating === 'number' &&
                userDetails.rating > 0
                  ? `⭐ ${Number(userDetails.rating).toFixed(1)}`
                  : 'New host'}
              </Text>
            </View>
            <View style={styles.smallGhostBtn} accessible={false}>
              <Text style={styles.smallGhostBtnText}>View</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Capacity text */}
        <Text style={styles.capacityText}>
          {typeof liveEvent.capacity === 'number' && liveEvent.capacity > 0
            ? `${attendeeCountDisplay} / ${liveEvent.capacity} joined`
            : `${attendeeCountDisplay} joined`}
        </Text>

        {/* CTAs */}
        <View style={styles.ctaStack}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              showDisabledStyle && styles.primaryBtnDisabled,
            ]}
            onPress={handleActionButton}
            disabled={buttonDisabled}
            accessibilityRole='button'
            accessibilityLabel={actionButtonLabel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {joinLoading ? (
              <ActivityIndicator color='#fff' />
            ) : (
              <Text style={styles.primaryBtnText}>{actionButtonLabel}</Text>
            )}
          </TouchableOpacity>

          {joinFeedback && (
            <View
              style={[
                styles.joinFeedbackContainer,
                joinFeedback.tone === 'success' && styles.joinFeedbackSuccess,
                joinFeedback.tone === 'error' && styles.joinFeedbackError,
              ]}
            >
              <Text style={styles.joinFeedbackText}>
                {joinFeedback.message}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={handleReport}
            accessibilityRole='button'
            accessibilityLabel='Report event'
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name='flag' size={16} color='#111827' />
            <Text style={styles.ghostBtnText}>Report</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

// Description: Create theme-aware styles for EventPopUpCard
const createStyles = (theme) =>
  StyleSheet.create({
    // Sheet container (shadow only)
    bottomSheet: {
      zIndex: 100,
      elevation: 100,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -2 },
      backgroundColor: theme.colors.card,
    },
    // Rounded card + clipping
    sheetBackground: {
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      overflow: 'hidden',
    },

    // Floating handle
    handleWrap: {
      position: 'absolute',
      top: 8,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 10,
      pointerEvents: 'none',
    },
    handlePill: {
      width: 60,
      height: 6,
      borderRadius: 4,
      backgroundColor: theme.isDark ? '#64748B' : '#CFCFCF',
    },

    // Full-bleed header
    headerFullBleed: {
      marginTop: -HANDLE_CLEARANCE, // tuck under handle
      marginHorizontal: -16, // cancel scroll padding to go edge-to-edge
    },
    headerImage: {
      width: '100%',
      aspectRatio: 16 / 9,
    },

    // Typography + layout
    title: {
      fontSize: 24,
      fontWeight: '800',
      marginTop: 12,
      marginBottom: 6,
      color: theme.colors.text,
      flex: 1, // allow the title to take available space but not push actions out
      marginRight: 8,
      // Limit wrapping so the title doesn't push action buttons offscreen
      includeFontPadding: false,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    titleActions: {
      flexDirection: 'row',
      alignItems: 'center',
      // Ensure actions don't grow and remain tightly-sized
      flexShrink: 0,
      justifyContent: 'flex-end',
    },
    iconButton: {
      padding: 6,
      marginLeft: 8,
    },

    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      letterSpacing: 0.3,
      marginBottom: 6,
      marginTop: 10,
    },

    bodyText: {
      fontSize: 16,
      color: theme.colors.text,
      lineHeight: 22,
    },

    showMore: {
      color: theme.colors.primary,
      marginTop: 6,
      fontWeight: '700',
    },

    // Chips / meta
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.chipBackground,
      marginRight: 8,
      marginBottom: 8,
    },
    chipWarn: {
      backgroundColor: theme.isDark ? 'rgba(251,191,36,0.2)' : '#FFF4E5',
    },
    chipText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text,
      marginLeft: 6,
    },

    // Dividers
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginVertical: 10,
    },

    // Address row
    inlineButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    linkText: {
      fontSize: 16,
      color: theme.colors.primary,
      marginLeft: 6,
    },

    // Host card
    hostCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.backgroundSecondary,
      marginTop: 12,
    },
    hostAvatar: { width: 44, height: 44, borderRadius: 12, marginRight: 10 },
    hostName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    hostSub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
    smallGhostBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    smallGhostBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
    },

    // Capacity text
    capacityText: {
      fontSize: 14,
      color: theme.colors.primary,
      fontWeight: '700',
      marginTop: 14,
    },

    // CTAs
    ctaStack: { marginTop: 12 },
    primaryBtn: {
      backgroundColor: theme.colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 10,
    },
    primaryBtnDisabled: {
      backgroundColor: theme.isDark ? '#475569' : '#9DB6F2',
    },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    joinFeedbackContainer: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: theme.isDark ? 'rgba(59,130,246,0.15)' : '#E8F1FF',
      marginBottom: 12,
    },
    joinFeedbackSuccess: {
      backgroundColor: theme.isDark ? 'rgba(34,197,94,0.15)' : '#E4F7E7',
    },
    joinFeedbackError: {
      backgroundColor: theme.isDark ? 'rgba(239,68,68,0.15)' : '#FDE8E8',
    },
    joinFeedbackText: {
      textAlign: 'center',
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '500',
    },

    ghostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    ghostBtnText: {
      fontWeight: '700',
      color: theme.colors.text,
      marginLeft: 8,
    },
  });
