// Description: Unified helper to join/request/waitlist an event with clear status returns.
// Notes:
// - Pure and dependency-injected: no direct store imports; callers pass stores and navigation.
// - Centralizes messages via onShowMessage callback (no-op default).
// - Returns statuses/messages without performing navigation side-effects. Callers decide UX.

import { getEventEndMs } from '../utils/dateUtils';
import {
  event as trackEvent,
  trackJoinEventSafe,
} from '../../../services/analyticsService';
import { trackRsvpYes, trackJoinEvent } from '../../../lib/analytics';
import { callFirebaseFunction } from '../../../services/firebase/config';

// Safe no-op
const noop = () => {};
const fireAndForget = (fn) => {
  try {
    const res = fn?.();
    if (res && typeof res.then === 'function') {
      res.catch(() => {});
    }
  } catch {
    // Intentionally swallow
  }
};

function isEventEnded(event) {
  const endMs = getEventEndMs(event);
  if (typeof endMs !== 'number') return false;
  return Date.now() >= endMs;
}

function isCancelled(event) {
  const status = (event?.status || 'active').toString().toLowerCase();
  return status !== 'active';
}

function isFull(event) {
  const cap = typeof event?.capacity === 'number' ? event.capacity : null;
  const count = Array.isArray(event?.attendees) ? event.attendees.length : 0;
  return typeof cap === 'number' && cap > 0 && count >= cap;
}

function getPrivacy(event) {
  return (event?.privacy || 'public').toString().toLowerCase();
}

// Description: Unified join/request/waitlist entry point
// Params:
// - event: event object
// - user: current user object (must contain uid)
// - navigation: optional React Navigation object
// - stores: { eventStore } providing rsvpEvent(eventId, uid) and joinWaitlist(eventId, uid)?
// - options: { requireLocation=false, onShowMessage=(msg)=>void, requestJoinFn?: (eventId)=>Promise<any> }
export async function joinEvent({
  event,
  user,
  navigation: _navigation = null,
  stores = {},
  options = {},
}) {
  const onShowMessage = options.onShowMessage || noop;
  const requireLocation = !!options.requireLocation;
  const eventStore = stores?.eventStore || null;
  const analyticsPayloadBase = {
    event_id: event?.id || null,
    capacity: typeof event?.capacity === 'number' ? event.capacity : 0,
    attendee_count: Array.isArray(event?.attendees)
      ? event.attendees.length
      : 0,
    interest: event?.interest || null,
    category: event?.category || null,
  };

  try {
    // Basic guards
    if (!event || !event.id) {
      onShowMessage('Event is unavailable.');
      return { status: 'error', message: 'Event unavailable' };
    }
    if (!user || !user.uid) {
      onShowMessage('Please sign in to continue.');
      return { status: 'denied', message: 'Unauthenticated' };
    }

    // Owner/already attending short-circuit
    const uid = user.uid;
    const isOwner = event.ownerId === uid || event.hostId === uid;
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    const isAttendee = attendees.includes(uid);
    if (isOwner) {
      return {
        status: 'owner',
        nextRoute: { name: 'EventChat', params: { eventId: event.id } },
      };
    }
    if (isAttendee) {
      return {
        status: 'already-attending',
        nextRoute: { name: 'EventChat', params: { eventId: event.id } },
      };
    }

    // Soft-deleted, cancelled, or ended
    if (event.isDeleted === true || isCancelled(event)) {
      onShowMessage('This event is not accepting RSVPs.');
      return { status: 'denied', message: 'Event inactive' };
    }
    if (isEventEnded(event)) {
      onShowMessage('This event has ended.');
      return { status: 'ended', message: 'Event ended' };
    }

    // Optional: location gate
    if (requireLocation) {
      const hasLoc = !!(
        user.location &&
        user.location.latitude != null &&
        user.location.longitude != null
      );
      if (!hasLoc) {
        onShowMessage('Enable location to join nearby events.');
        return { status: 'denied', message: 'Location required' };
      }
    }

    // Tentative RSVP intent (fire-and-forget)
    fireAndForget(() =>
      trackRsvpYes({
        ...analyticsPayloadBase,
        rsvp_type: 'intent',
      })
    );

    // Capacity enforcement
    if (isFull(event)) {
      const canWaitlist = typeof eventStore?.joinWaitlist === 'function';
      if (canWaitlist) {
        try {
          await eventStore.joinWaitlist(event.id, uid);
          onShowMessage(
            'You are on the waitlist. We will notify you if a spot opens.'
          );
          fireAndForget(() =>
            trackEvent('waitlist_join', {
              ...analyticsPayloadBase,
            })
          );
          fireAndForget(() =>
            trackRsvpYes({
              ...analyticsPayloadBase,
              rsvp_type: 'waitlist',
              was_waitlisted: true,
            })
          );
          return {
            status: 'waitlisted',
            message:
              'Added to the waitlist. We will notify you if a spot opens.',
          };
        } catch (e) {
          onShowMessage(
            'Event is full and waitlist failed. Please try again later.'
          );
          return { status: 'error', message: e?.message || 'Waitlist failed' };
        }
      }
      onShowMessage('Event is full. Waitlist is not available.');
      return { status: 'denied', message: 'Event full' };
    }

    // Privacy routing
    const privacy = getPrivacy(event);

    // RSVP private/approval flow
    if (privacy === 'rsvp' || privacy === 'private' || privacy === 'approval') {
      // Allow DI for tests; fallback to callable
      if (typeof options.requestJoinFn === 'function') {
        await options.requestJoinFn(event.id);
      } else {
        await callFirebaseFunction('requestToJoinEvent', { eventId: event.id });
      }
      onShowMessage("Request sent. You'll be notified if accepted.");
      fireAndForget(() => trackEvent('rsvp_request', { privacy }));
      fireAndForget(() =>
        trackRsvpYes({
          ...analyticsPayloadBase,
          rsvp_type: 'request',
        })
      );
      return {
        status: 'requested',
        message: 'Request sent. We will notify you once the host responds.',
      };
    }

    // Public/direct RSVP
    if (typeof eventStore?.rsvpEvent === 'function') {
      await eventStore.rsvpEvent(event.id, uid);
      onShowMessage('You joined the event!');
      fireAndForget(() =>
        trackJoinEventSafe({
          capacity: event?.capacity || 0,
          attendeeCount: Array.isArray(event?.attendees)
            ? event.attendees.length + 1
            : 1,
          privacy,
        })
      );
      fireAndForget(() =>
        trackJoinEvent({
          ...analyticsPayloadBase,
          method: 'rsvp',
        })
      );
      return {
        status: 'joined',
        message: 'Joined! Opening the chat...',
      };
    }

    onShowMessage('Join is currently unavailable. Please try again later.');
    return { status: 'error', message: 'RSVP function unavailable' };
  } catch (err) {
    console.error('[joinEvent] error:', err);
    onShowMessage(err?.message || 'Action failed. Please try again.');
    return { status: 'error', message: err?.message || 'Unknown error' };
  }
}

export default joinEvent;
