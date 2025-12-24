// Description: Event-centric date helpers shared across Events feature screens and services.

export function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function getTimelineTimestamp(item) {
  if (!item) return 0;
  if (item.type === 'post') return toMillis(item.post?.createdAt);
  if (item.type === 'event')
    return (
      toMillis(item.event?.createdAt) ||
      toMillis(item.event?.date) ||
      toMillis(item.event?.startAt)
    );
  return 0;
}

export function mergeUniqueEvents(...eventArrays) {
  const map = new Map();
  eventArrays.flat().forEach((event) => {
    if (event && event.id) map.set(event.id, event);
  });

  const getEventTimestamp = (event) =>
    toMillis(event?.startAt) ||
    toMillis(event?.date) ||
    toMillis(event?.createdAt);

  return Array.from(map.values()).sort(
    (a, b) => getEventTimestamp(b) - getEventTimestamp(a)
  );
}

export function getEventEndMs(event) {
  if (!event) return null;
  let endMs = null;
  if (event.endAt) {
    if (typeof event.endAt?.toDate === 'function')
      endMs = event.endAt.toDate().getTime();
    else if (typeof event.endAt?.seconds === 'number')
      endMs = event.endAt.seconds * 1000;
    else if (event.endAt instanceof Date) endMs = event.endAt.getTime();
  } else if (event.date) {
    endMs = toMillis(event.date);
    if (endMs) endMs += 60 * 60 * 1000; // assume 1 hour duration when only start exists
  }
  return typeof endMs === 'number' ? endMs : null;
}
