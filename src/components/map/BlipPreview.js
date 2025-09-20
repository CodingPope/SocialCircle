import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import AttendeeBubbleRow from '../../features/events/AttendeeBubbleRow';

// Description: Floating preview bubble for an event blip with micro-animations and pointer.
// Props:
// - event
// - distanceText
// - onPress(event): open full card
// - onJoin(event): reuse EventPopUpCard handlers
// - onRequest(event): for RSVP/private
export default function BlipPreview({
  event,
  distanceText,
  onPress,
  onJoin,
  onRequest,
  style,
  pointerX,
  user,
}) {
  const title = event?.title || 'Untitled';
  const thumb = event?.imageUrl || event?.imageUri || null;
  const privacy = (event?.privacy || 'public').toLowerCase();
  const isRSVP =
    privacy === 'rsvp' || privacy === 'private' || privacy === 'approval';
  const [requestedLocal, setRequestedLocal] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState(null);
  const joinFeedbackTimeoutRef = useRef(null);
  const lastJoinMessageRef = useRef(null);

  // --- Derived membership/request state like EventPopUpCard ---
  const attendees = Array.isArray(event?.attendees) ? event.attendees : [];
  const requests = Array.isArray(event?.requests) ? event.requests : [];
  const isOwner =
    event?.ownerId && user?.uid ? event.ownerId === user.uid : false;
  const isAttendee = user?.uid ? attendees.includes(user.uid) : false;
  const isMember = isOwner || isAttendee;
  const hasRequested = user?.uid
    ? (requests.includes(user.uid) || requestedLocal) && !isMember
    : requestedLocal && !isMember;

  // Button label and disabled
  let buttonLabel = isMember
    ? 'Check Chat'
    : isRSVP
    ? hasRequested
      ? 'Requested'
      : 'RSVP'
    : 'Join';
  const joinDisabled = !isMember && isRSVP && hasRequested; // align with popup minimal rule
  const buttonDisabled = joinDisabled || joinLoading;

  // Derived: attendeesCount
  const attendeesCount =
    attendees.length ||
    (typeof event?.attendeesCount === 'number' ? event.attendeesCount : 0);

  // --- Time window + labels (unchanged) ---
  const { whenLabel, happeningNow } = useMemo(() => {
    const now = Date.now();
    let startMs = null;
    let endMs = null;
    const d = event?.date;
    if (d?.toDate) startMs = d.toDate().getTime();
    else if (typeof d?.seconds === 'number') startMs = d.seconds * 1000;
    else if (d instanceof Date) startMs = d.getTime();

    const e = event?.endAt;
    if (e?.toDate) endMs = e.toDate().getTime();
    else if (typeof e?.seconds === 'number') endMs = e.seconds * 1000;
    if (!endMs && startMs) endMs = startMs + 60 * 60 * 1000; // +1h fallback

    if (!startMs) return { whenLabel: 'Time TBD', happeningNow: false };

    const start = new Date(startMs);
    const startDateStr = start.toDateString();
    const todayStr = new Date().toDateString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toDateString();

    let label = '';
    if (now >= startMs && (typeof endMs !== 'number' || now < endMs)) {
      label = 'Happening now';
    } else if (startDateStr === todayStr) {
      label = `Today ${start.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}`;
    } else if (startDateStr === tomorrowStr) {
      label = `Tomorrow ${start.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}`;
    } else {
      const wd = start.toLocaleDateString([], { weekday: 'short' });
      const time = start.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
      label = `${wd} ${time}`;
    }
    return { whenLabel: label, happeningNow: label === 'Happening now' };
  }, [event?.date, event?.endAt]);

  const interestLabel = useMemo(() => {
    const interest = (event?.interest || event?.category || '').toString();
    return interest ? `🎯 ${interest}` : '';
  }, [event?.interest, event?.category]);

  // --- Micro-animations (unchanged) ---
  const appear = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Gentle entrance
    Animated.timing(appear, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [appear]);

  useEffect(() => {
    setRequestedLocal(false);
    setJoinLoading(false);
    lastJoinMessageRef.current = null;
    if (joinFeedbackTimeoutRef.current) {
      clearTimeout(joinFeedbackTimeoutRef.current);
      joinFeedbackTimeoutRef.current = null;
    }
    setJoinFeedback(null);
  }, [event?.id]);

  useEffect(() => {
    return () => {
      if (joinFeedbackTimeoutRef.current) {
        clearTimeout(joinFeedbackTimeoutRef.current);
        joinFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!happeningNow) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, happeningNow]);

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
    }, 3000);
  }, []);

  const animatedStyle = {
    opacity: appear,
    transform: [
      {
        translateY: appear.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0],
        }),
      },
      {
        scale: appear.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.02],
        }),
      },
    ],
  };

  const pointerPulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.08],
        }),
      },
    ],
  };

  const handlePrimaryAction = useCallback(() => {
    if (isMember) {
      onJoin?.(event);
      return;
    }

    const action = isRSVP && !isMember ? onRequest || onJoin : onJoin;
    if (typeof action !== 'function' || buttonDisabled) return;

    setJoinLoading(true);
    lastJoinMessageRef.current = null;

    Promise.resolve(
      action(event, {
        captureMessage: (msg) => {
          if (typeof msg === 'string') {
            lastJoinMessageRef.current = msg;
          }
        },
        onRequested: () => setRequestedLocal(true),
      })
    )
      .then((outcome) => {
        const payload =
          outcome && typeof outcome === 'object'
            ? outcome
            : outcome != null
            ? { status: outcome }
            : null;

        if (payload?.status === 'requested') {
          setRequestedLocal(true);
        }

        const inferredMessage =
          payload?.message ||
          lastJoinMessageRef.current ||
          (payload?.status === 'requested'
            ? 'Request sent. We will notify you once the host responds.'
            : payload?.status === 'waitlisted'
            ? 'Added to the waitlist. We will reach out if a spot opens.'
            : null);

        const tone =
          payload?.tone ||
          (payload?.status === 'error' || payload?.status === 'denied'
            ? 'error'
            : payload?.status === 'requested'
            ? 'success'
            : payload?.status === 'waitlisted'
            ? 'info'
            : 'info');

        if (inferredMessage) {
          showJoinFeedback({ message: inferredMessage, tone });
        }
      })
      .catch((err) => {
        console.error('[BlipPreview] join failed:', err);
        showJoinFeedback({
          message: err?.message || 'Join failed. Please try again.',
          tone: 'error',
        });
      })
      .finally(() => {
        lastJoinMessageRef.current = null;
        setJoinLoading(false);
      });
  }, [
    isMember,
    onJoin,
    event,
    isRSVP,
    onRequest,
    buttonDisabled,
    showJoinFeedback,
  ]);

  return (
    <Animated.View style={[style, styles.wrapper, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onPress?.(event)}
        style={[
          styles.container,
          !thumb && styles.containerNoImage,
          { width: '100%' },
        ]}
      >
        {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} /> : null}
        <View
          style={{
            flex: 1,
            marginLeft: thumb ? 12 : 0,
            minWidth: 0,
            paddingVertical: thumb ? 6 : 8,
          }}
        >
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {/* Meta chips: when, distance, interest (removed attendees count chip) */}
          <View style={styles.metaRow}>
            <View
              style={[
                styles.chip,
                happeningNow ? styles.chipNow : styles.chipNeutral,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  happeningNow ? styles.chipTextNow : styles.chipTextNeutral,
                ]}
                numberOfLines={1}
              >
                {whenLabel}
              </Text>
            </View>

            {attendeesCount > 0 ? (
              <View style={[styles.chip, styles.chipHeat]}>
                <Text
                  style={[styles.chipText, styles.chipTextHeat]}
                  numberOfLines={1}
                >
                  🔥 {attendeesCount} joined
                </Text>
              </View>
            ) : (
              <View style={[styles.chip, styles.chipNeutral]}>
                <Text
                  style={[styles.chipText, styles.chipTextNeutral]}
                  numberOfLines={1}
                >
                  Be the first
                </Text>
              </View>
            )}

            {!!distanceText && (
              <View style={[styles.chip, styles.chipNeutral]}>
                <Text
                  style={[styles.chipText, styles.chipTextNeutral]}
                  numberOfLines={1}
                >
                  📍 {distanceText}
                </Text>
              </View>
            )}

            {!!interestLabel && (
              <View style={[styles.chip, styles.chipNeutral]}>
                <Text
                  style={[styles.chipText, styles.chipTextNeutral]}
                  numberOfLines={1}
                >
                  {interestLabel}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actionsRow}>
            {Array.isArray(event?.attendees) && event.attendees.length > 0 ? (
              <View style={{ flex: 1, marginRight: 8 }}>
                <AttendeeBubbleRow
                  attendees={event.attendees}
                  snippets={event.attendeeSnippets || null}
                />
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handlePrimaryAction();
              }}
              style={[
                styles.btn,
                isMember
                  ? styles.btnMember
                  : isRSVP
                  ? styles.btnRSVP
                  : styles.btnJoin,
                buttonDisabled && styles.btnDisabled,
              ]}
              disabled={buttonDisabled}
            >
              {joinLoading ? (
                <ActivityIndicator size='small' color='#fff' />
              ) : (
                <Text style={styles.btnText}>{buttonLabel}</Text>
              )}
            </TouchableOpacity>
          </View>

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
        </View>
      </TouchableOpacity>

      {/* Teardrop pointer under the card to anchor to the blip */}
      <View
        style={[
          styles.pointerContainer,
          pointerX != null ? { left: pointerX - 6 } : null,
        ]}
        pointerEvents='none'
      >
        <View style={styles.pointerShadow} />
        <Animated.View
          style={[styles.pointer, happeningNow && pointerPulseStyle]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    // width comes from parent style
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    // Fill image to the curved edges: remove left/vertical padding and clip
    paddingLeft: 0,
    paddingRight: 8,
    paddingVertical: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  containerNoImage: {
    paddingLeft: 12,
    paddingVertical: 8,
  },
  // Larger, edge-to-edge left image
  thumb: {
    width: 104,
    height: '100%',
    backgroundColor: '#eee',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  thumbFallback: { backgroundColor: '#E5E7EB' },
  title: { fontSize: 15, fontWeight: '800', color: '#111827' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 12,
  },
  chipNeutral: { backgroundColor: '#F3F4F6' },
  chipText: { fontSize: 10, fontWeight: '700' },
  chipTextNeutral: { color: '#4B5563' },
  chipNow: { backgroundColor: '#FEE2E2' },
  chipTextNow: { color: '#B91C1C' },
  chipHeat: { backgroundColor: '#FFF7ED' },
  chipTextHeat: { color: '#B45309' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  btnJoin: { backgroundColor: '#10B981' },
  btnRSVP: { backgroundColor: '#3B82F6' },
  btnMember: { backgroundColor: '#6366F1' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  joinFeedbackContainer: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#E8F1FF',
    alignSelf: 'flex-start',
  },
  joinFeedbackSuccess: {
    backgroundColor: '#E4F7E7',
  },
  joinFeedbackError: {
    backgroundColor: '#FDE8E8',
  },
  joinFeedbackText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1F2937',
  },
  // Pointer (teardrop) under the card
  pointerContainer: {
    position: 'absolute',
    top: '100%',
    // pull the pointer down so the teardrop touches the map marker blip
    // pull the pointer down so the teardrop touches the map marker blip
    marginTop: 0,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    // no default translateX; computed from pointerX
  },
  pointerShadow: {
    position: 'absolute',
    // slightly reduce the shadow offset so it sits closer to the marker
    top: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
    transform: [{ scaleX: 1.2 }, { scaleY: 0.6 }],
  },
  pointer: {
    width: 0,
    height: 0,
    // make the teardrop a little taller so the tip reaches the marker
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
  },
});
