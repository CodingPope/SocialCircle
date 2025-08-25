// src/lib/joinEvent.js
// Description: Unified helper to join/request/waitlist an event with clear status returns.
// Notes:
// - Pure and dependency-injected: no direct store imports; callers pass stores and navigation.
// - Centralizes messages via onShowMessage callback (no-op default).
// - Navigates to Event Chat on successful direct join only.

import { navigateToEventChat } from '../../navigation/RootNavigation';
import {
  event as trackEvent,
  trackJoinEventSafe,
} from '../../services/analytics';
import { trackRsvpYes, trackJoinEvent } from '../../lib/analytics';

// Safe no-op
const noop = () => {};

// Description: Compute event end timestamp in ms (prefer endAt, fallback to date + 1h)
function getEventEndMs(event) {
  if (!event) return null;
  let end = null;
  if (event.endAt) {
    if (typeof event.endAt?.toDate === 'function')
      end = event.endAt.toDate().getTime();
    else if (typeof event.endAt?.seconds === 'number')
      end = event.endAt.seconds * 1000;
  } else if (event.date) {
    if (typeof event.date?.toDate === 'function')
      end = event.date.toDate().getTime();
    else if (typeof event.date?.seconds === 'number')
      end = event.date.seconds * 1000;
    else if (event.date instanceof Date) end = event.date.getTime();
    if (end) end += 60 * 60 * 1000; // assume 1h duration when only start exists
  }
  return end;
}

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
  navigation = null,
  stores = {},
  options = {},
}) {
  const onShowMessage = options.onShowMessage || noop;
  const requireLocation = !!options.requireLocation;
  const eventStore = stores?.eventStore || null;

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
    try {
      await trackRsvpYes({
        event_id: event.id,
        capacity: typeof event.capacity === 'number' ? event.capacity : 0,
        attendee_count: attendees.length,
        interest: event?.interest,
        category: event?.category,
      });
    } catch {}

    // Capacity enforcement
    if (isFull(event)) {
      const canWaitlist = typeof eventStore?.joinWaitlist === 'function';
      if (canWaitlist) {
        try {
          await eventStore.joinWaitlist(event.id, uid);
          onShowMessage(
            'Added to the waitlist. We will notify you if a spot opens.'
          );
          try {
            await trackEvent('waitlist_join', {
              capacity: event?.capacity || 0,
              attendee_count: Array.isArray(event?.attendees)
                ? event.attendees.length
                : 0,
            });
            await trackRsvpYes({
              event_id: event.id,
              capacity: typeof event.capacity === 'number' ? event.capacity : 0,
              attendee_count: attendees.length,
              was_waitlisted: true,
              interest: event?.interest,
              category: event?.category,
            });
          } catch {}
          return { status: 'waitlisted' };
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
        // Lazy import to keep helper tree-shakeable and test-friendly
        const { getFunctions, httpsCallable } = await import(
          'firebase/functions'
        );
        const { getApp } = await import('firebase/app');
        const functions = getFunctions(getApp(), 'us-central1');
        const requestFn = httpsCallable(functions, 'requestToJoinEvent');
        await requestFn({ eventId: event.id });
      }
      onShowMessage("Request sent. You'll be notified if accepted.");
      try {
        await trackEvent('rsvp_request', { privacy });
        await trackRsvpYes({ event_id: event.id });
      } catch {}
      return { status: 'requested' };
    }

    // Public/direct RSVP
    if (typeof eventStore?.rsvpEvent === 'function') {
      await eventStore.rsvpEvent(event.id, uid);

      // Navigate to chat on join
      const params = { eventId: event.id };
      if (navigation && typeof navigation.navigate === 'function') {
        navigation.navigate('EventChat', params);
      } else {
        navigateToEventChat(event.id);
      }
      onShowMessage('You joined the event!');
      try {
        await trackJoinEventSafe({
          capacity: event?.capacity || 0,
          attendeeCount: Array.isArray(event?.attendees)
            ? event.attendees.length + 1
            : 1,
          privacy,
        });
        await trackJoinEvent({
          event_id: event.id,
          method: 'rsvp',
          interest: event?.interest,
          category: event?.category,
        });
      } catch {}
      return { status: 'joined', nextRoute: { name: 'EventChat', params } };
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
