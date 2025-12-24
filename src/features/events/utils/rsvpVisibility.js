const normalizeString = (value) =>
  typeof value === 'string' ? value.trim() : '';

const normalizePrivacy = (event) => {
  const raw = normalizeString(event?.privacy);
  if (raw) return raw.toLowerCase();
  if (event?.isRSVP === true) return 'rsvp';
  return '';
};

const addId = (set, value) => {
  if (typeof value === 'string' && value.trim()) set.add(value);
};

const addList = (set, list) => {
  if (!Array.isArray(list)) return;
  list.forEach((value) => addId(set, value));
};

export const isRsvpEvent = (event) => normalizePrivacy(event) === 'rsvp';

export const getEventHostIds = (event) => {
  const ids = new Set();
  if (!event) return ids;
  addId(ids, event.ownerId);
  addId(ids, event.hostId);
  addId(ids, event.owner);
  addId(ids, event.ownerUID);
  addId(ids, event.host);
  addId(ids, event.hostUID);
  addList(ids, event.hosts);
  addList(ids, event.coHosts);
  addList(ids, event.admins);
  addList(ids, event.moderators);
  return ids;
};

export const isEventMember = (event, viewerId) => {
  if (!event || !viewerId) return false;
  if (getEventHostIds(event).has(viewerId)) return true;
  const attendees = Array.isArray(event.attendees) ? event.attendees : [];
  if (attendees.includes(viewerId)) return true;
  const snippets = event.attendeeSnippets;
  if (snippets && typeof snippets === 'object') {
    return Object.prototype.hasOwnProperty.call(snippets, viewerId);
  }
  return false;
};

export const shouldMaskRsvpDetails = (event, viewerId) =>
  isRsvpEvent(event) && !isEventMember(event, viewerId);

export const getEventCityLabel = (event, fallback) => {
  const direct = normalizeString(event?.city);
  if (direct) return direct;

  const raw =
    normalizeString(event?.locationName) ||
    normalizeString(event?.address) ||
    normalizeString(event?.location?.address) ||
    normalizeString(event?.location?.name) ||
    normalizeString(event?.location?.label) ||
    normalizeString(fallback);
  if (!raw) return '';

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0];

  const first = parts[0];
  const second = parts[1] || '';
  const firstHasDigits = /\d/.test(first);
  const secondLooksState = second.length > 0 && second.length <= 3;
  if (firstHasDigits) return second || first;
  if (secondLooksState) return first;
  return second || first;
};
