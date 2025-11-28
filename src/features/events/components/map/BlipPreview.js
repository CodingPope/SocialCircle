import React, {
  useMemo,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AttendeeBubbleRow } from '../..';
import { getCategoryConfig } from '../../constants/categoryPins';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const adjustHexColor = (hex, amount = 0) => {
  if (typeof hex !== 'string') return '#E5E7EB';
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return '#E5E7EB';

  const num = parseInt(normalized, 16);
  const factor = clamp(amount, -1, 1);
  const adjust = (shift) => {
    const base = (num >> shift) & 0xff;
    return clamp(Math.round(base + factor * 255), 0, 255);
  };
  const r = adjust(16);
  const g = adjust(8);
  const b = adjust(0);
  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

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

  const fallbackInitial = useMemo(() => {
    const source = (event?.title || event?.interest || '').trim();
    return source ? source.charAt(0).toUpperCase() : '🎉';
  }, [event?.title, event?.interest]);

  const categoryConfig = useMemo(() => getCategoryConfig(event || {}), [event]);
  const placeholderEmoji = categoryConfig?.emoji || fallbackInitial;
  const placeholderColor = categoryConfig?.color || '#E5E7EB';
  const placeholderGradientStart = useMemo(
    () => adjustHexColor(placeholderColor, 0.18),
    [placeholderColor]
  );
  const placeholderGradientEnd = useMemo(
    () => adjustHexColor(placeholderColor, -0.12),
    [placeholderColor]
  );

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
      {/* Teardrop pointer under the card to anchor to the blip */}
      <View
        style={[
          styles.pointerContainer,
          pointerX != null ? { left: pointerX - 6 } : null,
        ]}
        pointerEvents='none'
      >
        <View style={styles.pointerShadow} />
        <Animated.View style={styles.pointer} />
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onPress?.(event)}
        style={[styles.container, { width: '100%' }]}
      >
        <View
          style={[
            styles.thumbWrapper,
            !thumb && styles.thumbWrapperFallback,
            !thumb && { backgroundColor: placeholderColor },
          ]}
        >
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              style={styles.thumbImage}
              resizeMode='cover'
            />
          ) : (
            <LinearGradient
              colors={[placeholderGradientStart, placeholderGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.thumbGradient}
            >
              <View style={styles.thumbBadgeOuter}>
                <View
                  style={[
                    styles.thumbBadgeInner,
                    { borderColor: placeholderGradientStart },
                  ]}
                >
                  <Text style={styles.thumbEmoji}>{placeholderEmoji}</Text>
                </View>
              </View>
            </LinearGradient>
          )}
        </View>
        <View style={styles.infoPanelWrapper}>
          <View style={styles.infoPanel}>
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
                <View style={{ flex: 1, marginRight: 6 }}>
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
                  try {
                    e?.stopPropagation?.();
                  } catch (err) {
                    console.warn('[BlipPreview] stopPropagation failed', err);
                  }

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
        </View>
      </TouchableOpacity>
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
    paddingLeft: 0,
    paddingRight: 0,
    paddingVertical: 0,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 1,
  },
  thumbWrapper: {
    width: 84,
    alignSelf: 'stretch',
    minHeight: 84,
    backgroundColor: '#eee',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbWrapperFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbGradient: {
    flex: 1,
    width: '100%',
    height: '100%',
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbBadgeOuter: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
  },
  thumbBadgeInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  thumbEmoji: {
    fontSize: 26,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  infoPanelWrapper: {
    flex: 1,
    marginLeft: 0,
  },
  infoPanel: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingRight: 10,
    paddingLeft: 12,
    backgroundColor: '#FDFDFC',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    shadowColor: '#8C9EFF',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(17,24,39,0.05)',
  },
  title: { fontSize: 15, fontWeight: '800', color: '#111827' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 4 },
  chip: {
    paddingHorizontal: 6,
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
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
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
    marginTop: -6,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    // no default translateX; computed from pointerX
    zIndex: 0,
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
