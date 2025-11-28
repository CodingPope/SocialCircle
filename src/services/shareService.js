import { Alert, Platform, Share } from 'react-native';
import { functions } from '../services/firebase/config';
import { trackShareEvent } from '../lib/analytics';
import { event as trackAnalyticsEvent } from './analyticsService';
import { getUniversalLinkSettings } from './deepLinkingService';

const shareLinkCache = new Map();
let shareCallable = null;

function sanitize(str) {
  return typeof str === 'string' ? str.trim() : '';
}

function truncate(text, max = 160) {
  if (!text || typeof text !== 'string') return '';
  const merged = text.replace(/\s+/g, ' ').trim();
  if (merged.length <= max) return merged;
  return `${merged.slice(0, max - 1)}…`;
}

function toDate(value) {
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

function formatDate(value) {
  const date = toDate(value);
  if (!date) return '';
  try {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (err) {
    return '';
  }
}

function pickLocation(event) {
  if (!event) return '';
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

function ensureCallable() {
  if (!shareCallable) {
    shareCallable = functions.httpsCallable('shareGenerateLink');
  }
  return shareCallable;
}

function fallbackUrl(type, id) {
  const settings = getUniversalLinkSettings();
  const base = settings.previewBaseUrl || 'https://socialcircle.app/share';
  return `${base.replace(/\/$/, '')}/${type}/${encodeURIComponent(id)}`;
}

async function getShareLink(type, id) {
  const key = `${type}:${id}`;
  if (shareLinkCache.has(key)) {
    return shareLinkCache.get(key);
  }

  let payload = null;
  try {
    const call = ensureCallable();
    const res = await call({ type, id });
    payload = res?.data || null;
  } catch (err) {
    console.warn(
      '[share] callable failed, using fallback',
      err?.message || err
    );
  }

  const result =
    payload && payload.url
      ? payload
      : { url: fallbackUrl(type, id), preview: {}, shareable: { type, id } };
  shareLinkCache.set(key, result);
  return result;
}

function activityToChannel(activityType) {
  if (!activityType)
    return Platform.OS === 'ios' ? 'ios_share' : 'android_share';
  const map = {
    'com.apple.UIKit.activity.CopyToPasteboard': 'copy',
    'com.apple.UIKit.activity.Mail': 'mail',
    'com.apple.UIKit.activity.Message': 'sms',
    'com.apple.UIKit.activity.PostToFacebook': 'facebook',
    'com.apple.UIKit.activity.PostToTwitter': 'twitter',
    'com.apple.UIKit.activity.PostToWeibo': 'weibo',
    'com.apple.UIKit.activity.PostToTencentWeibo': 'tencent_weibo',
    'com.apple.UIKit.activity.AirDrop': 'airdrop',
    'com.apple.UIKit.activity.Print': 'print',
    'com.apple.UIKit.activity.MarkupAsPDF': 'pdf',
    'com.apple.UIKit.activity.AddToReadingList': 'reading_list',
    'com.apple.UIKit.activity.OpenInIBooks': 'ibooks',
    'com.apple.UIKit.activity.AssignToContact': 'assign_contact',
    'com.apple.UIKit.activity.SaveToCameraRoll': 'camera_roll',
    'com.apple.UIKit.activity.PostToFlickr': 'flickr',
    'com.apple.UIKit.activity.PostToVimeo': 'vimeo',
  };
  return map[activityType] || activityType;
}

function buildEventMessage(event, link, preview = {}) {
  // Description: TestFlight beta marketing message for events
  const testflightUrl = 'https://testflight.apple.com/join/qSuvsM4q';
  const lines = [];
  const title =
    sanitize(event?.title) ||
    sanitize(preview?.title) ||
    'Check out this event on Social Circle';
  lines.push(`🎉 ${title}`);

  const when = formatDate(event?.date) || preview?.descriptionTime;
  if (when) lines.push(`📅 ${when}`);

  const where = pickLocation(event);
  if (where) lines.push(`📍 ${where}`);

  const snippet = truncate(event?.description || preview?.description, 120);
  if (snippet) lines.push(snippet);

  lines.push('');
  lines.push('✨ Want to join spontaneous hangouts like this?');
  lines.push(
    'Social Circle is the app for making real friends through short-term, in-person events.'
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

function buildPostMessage(post, link, preview = {}) {
  // Description: TestFlight beta marketing message for posts
  const testflightUrl = 'https://testflight.apple.com/join/qSuvsM4q';
  const author = sanitize(
    post?.creatorSnapshot?.displayName ||
      post?.creatorSnapshot?.name ||
      preview?.title ||
      'New on Social Circle'
  );
  const snippet = truncate(post?.content || preview?.description, 150);
  const lines = [`💬 ${author}`];
  if (snippet) lines.push(snippet);

  lines.push('');
  lines.push('✨ Join the conversation on Social Circle!');
  lines.push(
    'The app for adults who want to make real friends and meet in person.'
  );
  lines.push('');
  lines.push('🚀 Join the beta:');
  lines.push(testflightUrl);
  lines.push('');
  lines.push('Map-first discovery • Interest-based events • Real connections');

  return lines.filter(Boolean).join('\n');
}

function buildProfileMessage(profile, link, preview = {}) {
  // Description: TestFlight beta marketing message for profiles
  const testflightUrl = 'https://testflight.apple.com/join/qSuvsM4q';
  const displayName = sanitize(
    profile?.displayName ||
      `${profile?.firstName || ''} ${profile?.lastName || ''}` ||
      preview?.title ||
      'Connect on Social Circle'
  );

  const headline = truncate(
    profile?.bio || preview?.description || profile?.tagline,
    140
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

function handleShareResult(result) {
  if (!result) return { completed: false, channel: 'unknown' };
  if (result.action === Share.dismissedAction) {
    return { completed: false, channel: 'dismissed' };
  }
  const channel =
    Platform.OS === 'ios'
      ? activityToChannel(result.activityType)
      : 'android_share';
  return { completed: true, channel };
}

export async function shareEvent(event, context = {}) {
  if (!event || !event.id) {
    Alert.alert('Share unavailable', 'Event details are missing.');
    return { completed: false };
  }

  try {
    // Description: Use TestFlight URL for beta testing period
    const testflightUrl = 'https://testflight.apple.com/join/qSuvsM4q';
    const message = buildEventMessage(event, testflightUrl, {});
    const result = await Share.share({
      message,
      url: testflightUrl,
      subject: `🎉 ${
        sanitize(event?.title) || 'Check out this event on Social Circle'
      }`,
    });
    const outcome = handleShareResult(result);

    if (outcome.completed) {
      try {
        trackShareEvent({
          event_id: event.id,
          channel: outcome.channel,
          surface: context.surface || 'event_detail',
          source: context.source || 'share_button',
        });
      } catch (err) {
        // ignore analytics failure
      }

      try {
        trackAnalyticsEvent('share_event', {
          surface: context.surface || 'event_detail',
          has_image: Boolean(event?.imageUrl),
          beta_mode: true,
        });
      } catch (err) {
        // ignore
      }
    }

    return { ...outcome, url: testflightUrl };
  } catch (err) {
    Alert.alert(
      'Share failed',
      err?.message || 'Unable to share this event right now.'
    );
    return { completed: false, error: err };
  }
}

export async function sharePost(post, context = {}) {
  if (!post || !post.id) {
    Alert.alert('Share unavailable', 'Post details are missing.');
    return { completed: false };
  }

  try {
    // Description: Use TestFlight URL for beta testing period
    const testflightUrl = 'https://testflight.apple.com/join/qSuvsM4q';
    const message = buildPostMessage(post, testflightUrl, {});
    const subject = sanitize(
      post?.creatorSnapshot?.displayName ||
        post?.creatorSnapshot?.name ||
        'Check out this post on Social Circle'
    );
    const result = await Share.share({ message, url: testflightUrl, subject });
    const outcome = handleShareResult(result);

    if (outcome.completed) {
      try {
        trackAnalyticsEvent('share_post', {
          surface: context.surface || 'interest_post',
          has_media: Boolean(post?.mediaUrl),
          beta_mode: true,
        });
      } catch (err) {
        // ignore analytics failure
      }
    }

    return { ...outcome, url: testflightUrl };
  } catch (err) {
    Alert.alert(
      'Share failed',
      err?.message || 'Unable to share this post right now.'
    );
    return { completed: false, error: err };
  }
}

export async function shareProfile(profile, context = {}) {
  if (!profile || !profile.uid) {
    Alert.alert('Share unavailable', 'Profile details are missing.');
    return { completed: false };
  }

  try {
    // Description: Use TestFlight URL for beta testing period
    const testflightUrl = 'https://testflight.apple.com/join/qSuvsM4q';
    const message = buildProfileMessage(profile, testflightUrl, {});
    const subject = sanitize(
      profile.displayName ||
        `${profile.firstName || ''} ${profile.lastName || ''}`.trim() ||
        'Join Social Circle'
    );
    const result = await Share.share({ message, url: testflightUrl, subject });
    const outcome = handleShareResult(result);

    if (outcome.completed) {
      const hasImage = Boolean(profile?.profileImage || profile?.avatarURL);
      try {
        trackAnalyticsEvent('share_profile', {
          surface: context.surface || 'profile',
          source: context.source || 'share_button',
          channel: outcome.channel,
          has_image: hasImage,
          beta_mode: true,
        });
      } catch (err) {
        // ignore analytics failure
      }
    }

    return { ...outcome, url: testflightUrl };
  } catch (err) {
    Alert.alert(
      'Share failed',
      err?.message || 'Unable to share this profile right now.'
    );
    return { completed: false, error: err };
  }
}

export async function getShareLinkFor(type, id) {
  return getShareLink(type, id);
}
