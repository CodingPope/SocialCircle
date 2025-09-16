// Description: Business logic helper to handle joining an event.
// Minimally implements the contract asserted in tests.

export async function joinEvent({
  event,
  user,
  navigation,
  stores = {},
  options = {},
}) {
  const { eventStore } = stores;
  const { onShowMessage, requestJoinFn } = options;

  if (!event || !event.id) return { status: 'error' };
  if (user && event.ownerId === user.uid) return { status: 'owner' };
  if (!user || !user.uid) return { status: 'denied' };

  // ended/cancelled guard
  const nowSec = Math.floor(Date.now() / 1000);
  if (event.status === 'cancelled') return { status: 'denied' };
  if (event.date?.seconds && event.date.seconds < nowSec - 60 * 5) {
    // ended 5+ min ago
    return { status: 'ended' };
  }

  if (Array.isArray(event.attendees) && event.attendees.includes(user.uid)) {
    return { status: 'already-attending' };
  }

  const capacity = event.capacity || 0;
  const attendeesCount = Array.isArray(event.attendees)
    ? event.attendees.length
    : 0;
  const isFull = capacity > 0 && attendeesCount >= capacity;

  // privacy modes: public (default), rsvp (requires approval)
  if (event.privacy === 'rsvp') {
    if (typeof requestJoinFn === 'function') {
      await requestJoinFn(event.id);
    }
    onShowMessage?.('Requested to join');
    return { status: 'requested' };
  }

  if (isFull) {
    if (eventStore?.joinWaitlist) {
      await eventStore.joinWaitlist(event.id, user.uid);
      onShowMessage?.('Added to waitlist');
      return { status: 'waitlisted' };
    }
    onShowMessage?.('Event full');
    return { status: 'full' };
  }

  if (eventStore?.rsvpEvent) {
    await eventStore.rsvpEvent(event.id, user.uid);
  }
  if (navigation?.navigate) {
    navigation.navigate('Event', { id: event.id });
  }
  onShowMessage?.('Joined event');
  return { status: 'joined' };
}
