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
          'GOOGLE_MAPS_API_KEY',
          'GOOGLE_CLIENT_ID',
          'GOOGLE_IOS_CLIENT_ID',
          'GOOGLE_EXPO_CLIENT_ID',
          'EAS_PROJECT_ID',
          'IOS_BUNDLE_ID',
          'USE_FIREBASE_EMULATORS',
        ],
      },
    ],
    // NOTE: must be last
    'react-native-reanimated/plugin',
  ],
};
