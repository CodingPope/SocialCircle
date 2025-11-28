// __tests__/lib/joinEvent.test.js
import { joinEvent } from '../../src/features/events/testing/joinEventTestHelper';

describe('joinEvent', () => {
  const makeEvent = (over = {}) => ({
    id: 'e1',
    ownerId: 'host',
    attendees: [],
    privacy: 'public',
    status: 'active',
    ...over,
  });
  const user = { uid: 'u1', location: { latitude: 1, longitude: 1 } };

  const nav = { navigate: jest.fn() };
  const makeStore = (impl = {}) => impl;
  const toast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns owner when caller is host', async () => {
    const ev = makeEvent({ ownerId: 'u1' });
    const res = await joinEvent({
      event: ev,
      user,
      stores: makeStore(),
      options: { onShowMessage: toast },
    });
    expect(res.status).toBe('owner');
    expect(toast).not.toHaveBeenCalled();
  });

  it('returns already-attending when user is in attendees', async () => {
    const ev = makeEvent({ attendees: ['x', 'u1'] });
    const res = await joinEvent({
      event: ev,
      user,
      stores: makeStore(),
      options: { onShowMessage: toast },
    });
    expect(res.status).toBe('already-attending');
  });

  it('denies when unauthenticated', async () => {
    const ev = makeEvent();
    const res = await joinEvent({
      event: ev,
      user: null,
      stores: makeStore(),
      options: { onShowMessage: toast },
    });
    expect(res.status).toBe('denied');
  });

  it('denies when ended/cancelled', async () => {
    const ended = makeEvent({
      date: { seconds: Math.floor(Date.now() / 1000) - 3600 },
    });
    const res1 = await joinEvent({
      event: ended,
      user,
      stores: makeStore(),
      options: { onShowMessage: toast },
    });
    expect(['ended', 'denied']).toContain(res1.status);

    const cancelled = makeEvent({ status: 'cancelled' });
    const res2 = await joinEvent({
      event: cancelled,
      user,
      stores: makeStore(),
      options: { onShowMessage: toast },
    });
    expect(res2.status).toBe('denied');
  });

  it('public event -> calls rsvpEvent and navigates', async () => {
    const ev = makeEvent();
    const eventStore = { rsvpEvent: jest.fn().mockResolvedValue({}) };
    const res = await joinEvent({
      event: ev,
      user,
      navigation: nav,
      stores: { eventStore },
      options: { onShowMessage: toast },
    });
    expect(eventStore.rsvpEvent).toHaveBeenCalledWith('e1', 'u1');
    expect(res.status).toBe('joined');
  });

  it('full -> waitlist when available', async () => {
    const ev = makeEvent({ capacity: 1, attendees: ['x'] });
    const eventStore = { joinWaitlist: jest.fn().mockResolvedValue({}) };
    const res = await joinEvent({
      event: ev,
      user,
      stores: { eventStore },
      options: { onShowMessage: toast },
    });
    expect(eventStore.joinWaitlist).toHaveBeenCalledWith('e1', 'u1');
    expect(res.status).toBe('waitlisted');
  });

  it('private/approval -> requestToJoinEvent', async () => {
    const ev = makeEvent({ privacy: 'rsvp' });
    const requestJoinFn = jest.fn().mockResolvedValue({});
    const res = await joinEvent({
      event: ev,
      user,
      stores: makeStore(),
      options: { onShowMessage: toast, requestJoinFn },
    });
    expect(requestJoinFn).toHaveBeenCalledWith('e1');
    expect(res.status).toBe('requested');
  });
});
