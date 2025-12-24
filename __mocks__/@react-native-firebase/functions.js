// Mock for @react-native-firebase/functions
const mockCallable = jest.fn(() =>
  Promise.resolve({ data: { success: true } })
);
const mockHttpsCallable = jest.fn(() => mockCallable);

const functions = jest.fn(() => ({
  httpsCallable: mockHttpsCallable,
  useEmulator: jest.fn(),
}));

// Expose for tests to configure
functions.mockCallable = mockCallable;
functions.mockHttpsCallable = mockHttpsCallable;

export default functions;
