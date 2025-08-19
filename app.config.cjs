// app.config.js
/** @type {import('@expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const projectId = 'c51101fd-e7e7-47ff-925e-44799b9dbe12'; // already in your repo
  const buildNumber = process.env.IOS_BUILD_NUMBER || '1'; // must increment each upload
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
  const sentryEnv = process.env.EXPO_PUBLIC_SENTRY_ENV || 'beta';
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';

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
        NSPhotoLibraryAddUsageDescription:
          'We save event photos and profile pictures to your library on request.',
        NSCalendarsUsageDescription:
          'Add events to your calendar if you choose.',
      },
      config: {
        usesNonExemptEncryption: false, // simplifies export compliance for TestFlight
      },
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
      // Optional: provide maps key to native (also keep using JS SDK key where needed)
      ['expo-location', {}],
    ],
    extra: {
      eas: { projectId },
      sentryDsn,
      sentryEnv,
      googleMapsApiKey, // if you want to read via expo-constants
    },
    web: { favicon: './assets/favicon.png' },
    owner: 'joe1561',
  };
};
