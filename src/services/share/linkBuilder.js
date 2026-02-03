import { Platform } from 'react-native';
import { functions } from '../firebase/config';
import logger from '../../lib/logger';
import { fallbackUrl } from './shareHelpers';

const shareLinkCache = new Map();
let shareCallable = null;

function ensureCallable() {
  if (!shareCallable) {
    shareCallable = functions.httpsCallable('shareGenerateLink');
  }
  return shareCallable;
}

export async function getShareLink(type, id) {
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
    logger.warn('[share] callable failed, using fallback', err?.message || err);
  }

  const result =
    payload && payload.url
      ? payload
      : { url: fallbackUrl(type, id), preview: {}, shareable: { type, id } };
  shareLinkCache.set(key, result);
  return result;
}

export function activityToChannel(activityType) {
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

export function clearShareLinkCache() {
  shareLinkCache.clear();
}
