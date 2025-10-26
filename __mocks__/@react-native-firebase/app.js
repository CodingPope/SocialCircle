// Mock for @react-native-firebase/app
export default () => ({
  app: jest.fn(() => ({
    name: '[DEFAULT]',
    options: {
      apiKey: 'mock-api-key',
      projectId: 'mock-project-id',
    },
  })),
  apps: [],
  SDK_VERSION: '18.0.0',
  initializeApp: jest.fn(),
  setLogLevel: jest.fn(),
});

export const firebase = {
  app: jest.fn(() => ({
    name: '[DEFAULT]',
  })),
  apps: [],
};
