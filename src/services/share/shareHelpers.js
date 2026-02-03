import { Platform } from 'react-native';
import { getUniversalLinkSettings } from '../deepLinkingService';
import {
  getEventCityLabel,
  shouldMaskRsvpDetails,
} from '../../features/events/utils/rsvpVisibility';

export function sanitize(str) {
  return typeof str === 'string' ? str.trim() : '';
}

export function truncate(text, max = 160) {
  if (!text || typeof text !== 'string') return '';
  const merged = text.replace(/\s+/g, ' ').trim();
  if (merged.length <= max) return merged;
  return `${merged.slice(0, max - 1)}…`;
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function formatDate(value, { includeTime = true } = {}) {
  const date = toDate(value);
  if (!date) return '';
  try {
    if (!includeTime) {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function pickLocation(event, { cityOnly = false } = {}) {
  if (!event) return '';
  if (cityOnly) {
    return getEventCityLabel(event);
  }
  if (event.locationName) return sanitize(event.locationName);
  if (event.address) return sanitize(event.address);
  const loc = event.location;
  if (!loc) return '';
  if (typeof loc === 'string') return sanitize(loc);
  if (loc.address) return sanitize(loc.address);
  if (loc.name) return sanitize(loc.name);
  if (loc.label) return sanitize(loc.label);
  const lat = loc.latitude ?? loc.lat ?? loc._lat;
  const lng = loc.longitude ?? loc.lng ?? loc._long ?? loc.lon;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
  return '';
}

export function fallbackUrl(type, id) {
  const settings = getUniversalLinkSettings();
  const base = settings.previewBaseUrl || 'https://socialcircle.app/share';
  return `${base.replace(/\/$/, '')}/${type}/${encodeURIComponent(id)}`;
}

export function buildEventMessage(event, preview = {}, options = {}) {
  const maskDetails = options?.maskDetails === true;
  const testflightUrl = 'https://testflight.apple.com/join/qSuvsM4q';
  const lines = [];
  const title =
    sanitize(event?.title) ||
    sanitize(preview?.title) ||
    'Check out this event on Social Circle';
  lines.push(`🎉 ${title}`);

  const when =
    formatDate(event?.date, { includeTime: !maskDetails }) ||
    preview?.descriptionTime;
  if (when) lines.push(`📅 ${when}`);

  const where = pickLocation(event, { cityOnly: maskDetails });
  if (where) lines.push(`📍 ${where}`);

  const snippet = truncate(event?.description || preview?.description, 120);
  if (snippet) lines.push(snippet);

  lines.push('');
  lines.push('✨ Want to join spontaneous hangouts like this?');
  lines.push(
    'Social Circle is the app for making real friends through short-term, in-person events.',
  );
  lines.push('');
  lines.push('🚀 Join the beta now:');
  lines.push(testflightUrl);
  lines.push('');
  lines.push('🗺️ Discover events near you');
  lines.push('👥 Meet people with shared interests');
  lines.push('⚡ No endless swiping, just real connections');

  return lines.filter(Boolean).join('\n');
}

export function buildPostMessage(post, preview = {}) {
  const testflightUrl = 'https://testflight.apple.com/join/qSuvsM4q';
  const author = sanitize(
    post?.creatorSnapshot?.displayName ||
      post?.creatorSnapshot?.name ||
      preview?.title ||
      'New on Social Circle',
  );
  const snippet = truncate(post?.content || preview?.description, 150);
  const lines = [`💬 ${author}`];
  if (snippet) lines.push(snippet);

  lines.push('');
  lines.push('✨ Join the conversation on Social Circle!');
  lines.push(
    'The app for adults who want to make real friends and meet in person.',
  );
  lines.push('');
  lines.push('🚀 Join the beta:');
  lines.push(testflightUrl);
  lines.push('');
  lines.push('Map-first discovery • Interest-based events • Real connections');

  return lines.filter(Boolean).join('\n');
}

export function buildProfileMessage(profile, preview = {}) {
  const testflightUrl = 'https://testflight.apple.com/join/qSuvsM4q';
  const displayName = sanitize(
    profile?.displayName ||
      `${profile?.firstName || ''} ${profile?.lastName || ''}` ||
      preview?.title ||
      'Connect on Social Circle',
  );

  const headline = truncate(
    profile?.bio || preview?.description || profile?.tagline,
    140,
  );

  const city = sanitize(profile?.city || profile?.location || '');

  const lines = [`${displayName}`];
  if (city) lines.push(`📍 ${city}`);

  lines.push('');
  lines.push('New to town? Just looking for friends? Find Your Circle!');
  lines.push('');
  lines.push('🚀 Join the beta now:');
  lines.push(testflightUrl);
  lines.push('');

  return lines.filter(Boolean).join('\n');
}

// Convenience wrapper used in shareService
export function buildEventSharePayload(event, context = {}) {
  const maskDetails = shouldMaskRsvpDetails(event, context?.viewerId || null);
  return {
    message: buildEventMessage(event, {}, { maskDetails }),
    url: 'https://testflight.apple.com/join/qSuvsM4q',
    subject:
      sanitize(event?.title) || 'Check out this event on Social Circle',
  };
}
