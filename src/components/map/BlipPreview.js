import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
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

  // --- Derived membership/request state like EventPopUpCard ---
  const attendees = Array.isArray(event?.attendees) ? event.attendees : [];
  const requests = Array.isArray(event?.requests) ? event.requests : [];
  const isOwner =
    event?.ownerId && user?.uid ? event.ownerId === user.uid : false;
  const isAttendee = user?.uid ? attendees.includes(user.uid) : false;
  const isMember = isOwner || isAttendee;
  const hasRequested = user?.uid
    ? requests.includes(user.uid) && !isMember
    : false;

  // Button label and disabled
  let buttonLabel = isMember
    ? 'Check Chat'
    : isRSVP
    ? hasRequested
      ? 'Requested'
      : 'RSVP'
    : 'Join';
  const joinDisabled = !isMember && isRSVP && hasRequested; // align with popup minimal rule

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
                if (isMember) onJoin?.(event); // go straight to chat handler
                else if (isRSVP) onRequest?.(event);
                else onJoin?.(event);
              }}
              style={[
                styles.btn,
                isMember
                  ? styles.btnMember
                  : isRSVP
                  ? styles.btnRSVP
                  : styles.btnJoin,
              ]}
              disabled={joinDisabled}
            >
              <Text style={styles.btnText}>{buttonLabel}</Text>
            </TouchableOpacity>
          </View>
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
  btnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  // Pointer (teardrop) under the card
  pointerContainer: {
    position: 'absolute',
    top: '100%',
    marginTop: 4,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    // no default translateX; computed from pointerX
  },
  pointerShadow: {
    position: 'absolute',
    top: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
    transform: [{ scaleX: 1.2 }, { scaleY: 0.6 }],
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
  },
});
