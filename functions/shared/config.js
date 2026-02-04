// Shared Firebase Functions config helpers
const projectId = process.env.GCLOUD_PROJECT;

const ENFORCE_APPCHECK =
  process.env.ENFORCE_APPCHECK === '1' ||
  process.env.ENFORCE_APPCHECK === 'true';

const BUSINESS_ENFORCE_APPCHECK =
  process.env.BUSINESS_ENFORCE_APPCHECK === '1' ||
  process.env.BUSINESS_ENFORCE_APPCHECK === 'true';

const JOIN_CALLABLE_OPTIONS = Object.freeze({
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 60,
  enforceAppCheck: ENFORCE_APPCHECK,
});

const ADMIN_CALLABLE_OPTIONS = Object.freeze({
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 120,
  enforceAppCheck: ENFORCE_APPCHECK,
});

const BUSINESS_CALLABLE_OPTIONS = Object.freeze({
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 120,
  enforceAppCheck: BUSINESS_ENFORCE_APPCHECK,
});

const SHARE_CONFIG = Object.freeze({
  apiKey:
    process.env.SHARE_DYNAMIC_LINK_API_KEY ||
    process.env.FIREBASE_WEB_API_KEY ||
    process.env.FIREBASE_API_KEY ||
    '',
  domainUriPrefix:
    process.env.SHARE_DYNAMIC_LINK_PREFIX ||
    process.env.DYNAMIC_LINK_PREFIX ||
    '',
  previewBase:
    process.env.SHARE_WEB_FALLBACK_BASE ||
    (projectId
      ? `https://${projectId}.cloudfunctions.net/sharePreview`
      : 'https://socialcircle.app/share'),
  iosBundleId: process.env.SHARE_IOS_BUNDLE_ID || 'com.socialcirclellc.app',
  iosAppStoreId: process.env.SHARE_IOS_APP_STORE_ID || '',
  iosFallbackUrl: process.env.SHARE_IOS_FALLBACK_URL || '',
  androidPackageName:
    process.env.SHARE_ANDROID_PACKAGE || 'com.socialcirclellc.app',
  androidFallbackUrl: process.env.SHARE_ANDROID_FALLBACK_URL || '',
});

module.exports = {
  projectId,
  ENFORCE_APPCHECK,
  BUSINESS_ENFORCE_APPCHECK,
  JOIN_CALLABLE_OPTIONS,
  ADMIN_CALLABLE_OPTIONS,
  BUSINESS_CALLABLE_OPTIONS,
  SHARE_CONFIG,
};
