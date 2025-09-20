import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@env';
import { useNavigation } from '@react-navigation/native';
import {
  doc,
  getDoc,
  onSnapshot, // live updates for event doc
} from 'firebase/firestore';
import { db, reportContent } from '../../firebase/config';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '../profile/userStore';
import { useEventStore } from './eventStore';
import { useUserSnippetStore } from '../profile/userSnippetStore';
import joinEvent from './joinEvent';
import { trackOpenEvent, trackReportContent } from '../../lib/analytics';
import { navigateToOtherUserProfile } from '../../navigation/RootNavigation';

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

  const [address, setAddress] = useState('Fetching address...');
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [userDetails, setUserDetails] = useState(null);
  const joinFeedbackTimeoutRef = useRef(null);
  const lastJoinMessageRef = useRef(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState(null);

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

  useEffect(() => {
    setLiveEvent(event || null);
  }, [event?.id]);

  useEffect(() => {
    if (joinFeedbackTimeoutRef.current) {
      clearTimeout(joinFeedbackTimeoutRef.current);
      joinFeedbackTimeoutRef.current = null;
    }
    setJoinFeedback(null);
    setJoinLoading(false);
    lastJoinMessageRef.current = null;
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
        if (!snap.exists()) {
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

  const handleActionButton = useCallback(async () => {
    if (!user || !liveEvent?.id || joinLoading) return;

    setJoinLoading(true);
    lastJoinMessageRef.current = null;

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

      // Owner or attendee -> navigate after closing sheet
      if (res?.status === 'owner' || res?.status === 'already-attending') {
        onClose && onClose();
        setTimeout(() => {
          navigation.navigate('EventChat', {
            eventId: liveEvent.id,
            locationName: address,
          });
        }, 50);
        return;
      }

      if (res?.status === 'joined') {
        onClose && onClose();
        setTimeout(() => {
          navigation.navigate('EventChat', {
            eventId: liveEvent.id,
            locationName: address,
          });
        }, 50);
        return;
      }

      if (res?.status === 'requested') {
        setRequestPendingLocal(true);
        showJoinFeedback({
          message: 'Request sent. We will notify you once the host responds.',
          tone: 'success',
        });
        return;
      }

      if (res?.status === 'waitlisted') {
        showJoinFeedback({
          message:
            capturedMessage ||
            'Added to the waitlist. We will reach out if a spot opens.',
          tone: 'info',
        });
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
    : require('../../../assets/smileDefault.png');

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
        <View style={styles.headerFullBleed}>
          {liveEvent.imageUri || liveEvent.imageUrl ? (
            <Image
              source={{ uri: liveEvent.imageUri || liveEvent.imageUrl }}
              style={styles.headerImage}
              resizeMode='cover'
            />
          ) : (
            <View style={styles.headerImagePlaceholder}>
              <Text style={styles.placeholderText}>No image</Text>
            </View>
          )}
        </View>

        {/* Title + chips */}
        <Text style={styles.title}>{liveEvent.title || 'Untitled Event'}</Text>

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
                {attendees.length}/{liveEvent.capacity}
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
              <Text style={styles.hostName}>{displayName}</Text>
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
            ? `${attendees.length} / ${liveEvent.capacity} joined`
            : `${attendees.length} joined`}
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

const styles = StyleSheet.create({
  // Sheet container (shadow only)
  bottomSheet: {
    zIndex: 100,
    elevation: 100,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
  },
  // Rounded card + clipping
  sheetBackground: {
    backgroundColor: '#fff',
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
    backgroundColor: '#CFCFCF',
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
  headerImagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Typography + layout
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 6,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.3,
    marginBottom: 6,
    marginTop: 10,
  },

  bodyText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },

  showMore: {
    color: '#2563EB',
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
    backgroundColor: '#F2F4F7',
    marginRight: 8,
    marginBottom: 8,
  },
  chipWarn: {
    backgroundColor: '#FFF4E5',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 6,
  },

  // Dividers
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
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
    color: '#2563EB',
    marginLeft: 6,
  },

  // Host card
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    marginTop: 12,
  },
  hostAvatar: { width: 44, height: 44, borderRadius: 12, marginRight: 10 },
  hostName: { fontSize: 16, fontWeight: '700' },
  hostSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  smallGhostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  smallGhostBtnText: { fontSize: 13, fontWeight: '700', color: '#111827' },

  // Capacity text
  capacityText: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '700',
    marginTop: 14,
  },

  // CTAs
  ctaStack: { marginTop: 12 },
  primaryBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnDisabled: {
    backgroundColor: '#9DB6F2',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  joinFeedbackContainer: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#E8F1FF',
    marginBottom: 12,
  },
  joinFeedbackSuccess: {
    backgroundColor: '#E4F7E7',
  },
  joinFeedbackError: {
    backgroundColor: '#FDE8E8',
  },
  joinFeedbackText: {
    textAlign: 'center',
    color: '#1F2937',
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
    borderColor: '#E5E7EB',
  },
  ghostBtnText: { fontWeight: '700', color: '#111827', marginLeft: 8 },
});
