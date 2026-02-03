import { Alert, Share, Platform } from 'react-native';
import { trackShareEvent } from '../../lib/analytics';
import { event as trackAnalyticsEvent } from '../analyticsService';
import {
  sanitize,
  buildEventMessage,
  buildPostMessage,
  buildProfileMessage,
  buildEventSharePayload,
} from './shareHelpers';
import { activityToChannel } from './linkBuilder';

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
    const { message, url, subject } = buildEventSharePayload(event, context);
    const result = await Share.share({
      message,
      url,
      subject: `🎉 ${subject}`,
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
      } catch {}

      try {
        trackAnalyticsEvent('share_event', {
          surface: context.surface || 'event_detail',
          has_image: Boolean(event?.imageUrl),
          beta_mode: true,
        });
      } catch {}
    }

    return { ...outcome, url };
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
      } catch {}
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
      } catch {}
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
