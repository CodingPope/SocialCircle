export function getBlockContext(user) {
  return {
    viewerId: user?.uid || null,
    blocked: new Set(
      Array.isArray(user?.blocked) ? user.blocked.filter(Boolean) : []
    ),
    blockedBy: new Set(
      Array.isArray(user?.blockedBy) ? user.blockedBy.filter(Boolean) : []
    ),
  };
}

export function isBlockedUser(targetId, context) {
  if (!targetId || !context) return false;
  return (
    context.blocked.has(targetId) || context.blockedBy.has(targetId)
  );
}

export function isEventVisibleForUser(event, context) {
  if (!event) return false;
  if (!context) return true;
  const hostId =
    event.ownerId || event.hostId || event.creatorId || event.userId || null;
  if (!hostId || hostId === context.viewerId) return true;
  return !isBlockedUser(hostId, context);
}

export function filterBlockedEvents(events, user) {
  const context = getBlockContext(user);
  return (Array.isArray(events) ? events : []).filter((event) =>
    isEventVisibleForUser(event, context)
  );
}

export function shouldHideProfile(targetUserId, user) {
  const context = getBlockContext(user);
  return targetUserId && isBlockedUser(targetUserId, context);
}
