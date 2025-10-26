// Mock for @react-native-firebase/functions
const functions = () => ({
  httpsCallable: jest.fn((name) =>
    jest.fn(() => Promise.resolve({ data: { success: true } }))
  ),
  useFunctionsEmulator: jest.fn(),
});

export default functions;
