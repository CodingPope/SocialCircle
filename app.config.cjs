// app.config.js
/** @type {import('@expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const projectId = 'c51101fd-e7e7-47ff-925e-44799b9dbe12'; // already in your repo
  const buildNumber = process.env.IOS_BUILD_NUMBER || '1'; // must increment each upload
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
  const sentryEnv = process.env.EXPO_PUBLIC_SENTRY_ENV || 'beta';
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';

  // Firebase configuration from environment variables
  const firebaseApiKey = process.env.FIREBASE_API_KEY || '';
  const firebaseAuthDomain = process.env.FIREBASE_AUTH_DOMAIN || '';
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || '';
  const firebaseStorageBucket = process.env.FIREBASE_STORAGE_BUCKET || '';
  const firebaseMessagingSenderId =
    process.env.FIREBASE_MESSAGING_SENDER_ID || '';
  const firebaseAppId = process.env.FIREBASE_APP_ID || '';

  return {
    ...config,
    name: 'SocialCircle',
    slug: 'socialcircle',
    scheme: 'socialcircle',
    version: '1.0.0',
    newArchEnabled: false,
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.socialcirclellc.app',
      buildNumber,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Social Circle uses your location to show nearby events and improve discovery.',
        NSCameraUsageDescription:
          'Allow camera access to take photos for events and your profile.',
        NSPhotoLibraryUsageDescription:
          'Allow photo library access to choose images for events and your profile.',
        NSPhotoLibraryAddUsageDescription:
          'We save event photos and profile pictures to your library on request.',
        NSCalendarsUsageDescription:
          'Allow calendar access so you can add events to your calendar.',
        NSRemindersUsageDescription:
          'Allow reminders access if you choose to manage reminders in Social Circle.',
      },
      config: {
        usesNonExemptEncryption: false,
        googleMapsApiKey: googleMapsApiKey,
      },
      useFrameworks: 'static',
    },
    android: {
      package: 'com.socialcirclellc.app',
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
    },
    plugins: [
      // match your dependencies
      ['expo-notifications', { icon: './assets/icon.png' }],
      'expo-video',
      'sentry-expo',
      ['expo-location', {}],
      'expo-calendar',
      'expo-font',
    ],
    extra: {
      eas: { projectId },
      sentryDsn,
      sentryEnv,
      googleMapsApiKey, // if you want to read via expo-constants
      // Firebase configuration
      firebaseApiKey,
      firebaseAuthDomain,
      firebaseProjectId,
      firebaseStorageBucket,
      firebaseMessagingSenderId,
      firebaseAppId,
    },
    web: { favicon: './assets/favicon.png' },
    owner: 'joe1561',
  };
};
