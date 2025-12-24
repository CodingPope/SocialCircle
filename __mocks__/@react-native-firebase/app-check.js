// Mock for @react-native-firebase/app-check
export default () => ({
  initializeAppCheck: jest.fn(() => Promise.resolve()),
  getToken: jest.fn(() => Promise.resolve({ token: 'mock-app-check-token' })),
  setTokenAutoRefreshEnabled: jest.fn(),
  newReactNativeFirebaseAppCheckProvider: jest.fn(() => ({
    configure: jest.fn(),
  })),
});
