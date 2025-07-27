// src/utils/mergeUniqueEvents.js

// ✅ Merges multiple event arrays into a unique, sorted list by start date (desc)
export function mergeUniqueEvents(...eventArrays) {
  const map = new Map();
  eventArrays.flat().forEach((ev) => {
    if (ev && ev.id) map.set(ev.id, ev);
  });

  return Array.from(map.values()).sort((a, b) => {
    const getDate = (e) =>
      e.startAt?.toDate
        ? e.startAt.toDate()
        : new Date(e.startAt?.seconds ? e.startAt.seconds * 1000 : e.startAt);
    return getDate(b) - getDate(a);
  });
}
