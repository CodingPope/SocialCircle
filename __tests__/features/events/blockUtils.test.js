// Description: Tests for block/filter helpers used in discovery and profiles
import {
  getBlockContext,
  isBlockedUser,
  isEventVisibleForUser,
  filterBlockedEvents,
  shouldHideProfile,
} from '../../../src/features/events/utils/blockUtils';

describe('blockUtils', () => {
  const viewer = {
    uid: 'viewer',
    blocked: ['u2'],
    blockedBy: ['u3'],
  };

  it('creates context with sets', () => {
    const ctx = getBlockContext(viewer);
    expect(ctx.viewerId).toBe('viewer');
    expect(ctx.blocked.has('u2')).toBe(true);
    expect(ctx.blockedBy.has('u3')).toBe(true);
  });

  it('detects blocked users', () => {
    const ctx = getBlockContext(viewer);
    expect(isBlockedUser('u2', ctx)).toBe(true);
    expect(isBlockedUser('u3', ctx)).toBe(true);
    expect(isBlockedUser('uX', ctx)).toBe(false);
  });

  it('hides events from blocked hosts', () => {
    const ctx = getBlockContext(viewer);
    expect(
      isEventVisibleForUser({ ownerId: 'u2' }, ctx)
    ).toBe(false);
    expect(
      isEventVisibleForUser({ hostId: 'u3' }, ctx)
    ).toBe(false);
    expect(
      isEventVisibleForUser({ ownerId: 'viewer' }, ctx)
    ).toBe(true);
    expect(isEventVisibleForUser({ ownerId: 'u4' }, ctx)).toBe(true);
  });

  it('filters event arrays', () => {
    const events = [
      { id: 1, ownerId: 'u2' },
      { id: 2, hostId: 'u3' },
      { id: 3, ownerId: 'u4' },
    ];
    const filtered = filterBlockedEvents(events, viewer);
    expect(filtered.map((e) => e.id)).toEqual([3]);
  });

  it('decides profile visibility', () => {
    expect(shouldHideProfile('u2', viewer)).toBe(true);
    expect(shouldHideProfile('u3', viewer)).toBe(true);
    expect(shouldHideProfile('u4', viewer)).toBe(false);
  });
});
