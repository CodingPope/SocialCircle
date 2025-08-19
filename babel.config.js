// babel.config.cjs
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        allowUndefined: true,
        // Only expose the vars we actually use in the app
        allowlist: [
          'FIREBASE_API_KEY',
          'FIREBASE_AUTH_DOMAIN',
          'FIREBASE_PROJECT_ID',
          'FIREBASE_STORAGE_BUCKET',
          'FIREBASE_MESSAGING_SENDER_ID',
          'FIREBASE_APP_ID',
          'GOOGLE_MAPS_API_KEY',
          'GOOGLE_CLIENT_ID',
          'GOOGLE_IOS_CLIENT_ID',
          'GOOGLE_EXPO_CLIENT_ID',
          'EAS_PROJECT_ID',
          'IOS_BUNDLE_ID',
        ],
      },
    ],
    // NOTE: must be last
    'react-native-reanimated/plugin',
  ],
};
