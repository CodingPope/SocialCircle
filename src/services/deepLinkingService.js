import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { navigate } from '../navigation/RootNavigation';

const extra = Constants?.expoConfig?.extra || {};
const shareExtra = extra?.share || {};

export function getUniversalLinkSettings() {
  const domain = shareExtra.domain || '';
  const previewBaseFromConfig = shareExtra.previewBaseUrl || '';
  const fallbackBase = extra?.firebaseProjectId
    ? `https://${extra.firebaseProjectId}.cloudfunctions.net/sharePreview`
    : 'https://socialcircle.app/share';
  return {
    domain,
    previewBaseUrl: previewBaseFromConfig || fallbackBase,
  };
}

export function shouldEnableDeepLinking() {
  // Dynamic links require a custom native runtime (not Expo Go)
  return Constants?.appOwnership && Constants.appOwnership !== 'expo';
}

export function parseShareLink(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/^\/+/, '');
    if (!path) return null;
    const segments = path.split('/');
    const [first, second] = segments;
    if (!second) return null;
    if (first === 'e' || first === 'event') {
      return { type: 'event', id: second };
    }
    if (first === 'p' || first === 'post') {
      return { type: 'post', id: second };
    }
    if (first === 'share') {
      const shareType = url.searchParams.get('type');
      const id = url.searchParams.get('id');
      if (shareType && id) {
        return { type: shareType, id };
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

export function handleIncomingLink(raw) {
  const parsed = parseShareLink(raw);
  if (!parsed?.type || !parsed?.id) return false;

  if (parsed.type === 'event') {
    navigate('MainTabs', {
      screen: 'Map',
      params: { initialEventId: parsed.id },
    });
    return true;
  }

  if (parsed.type === 'post') {
    navigate('InterestPost', {
      postId: parsed.id,
      initialSource: 'deep_link',
    });
    return true;
  }

  return false;
}

export function buildEventLinkPath(eventId) {
  return `https://${getUniversalLinkSettings().domain}/e/${eventId}`;
}
