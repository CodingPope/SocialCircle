// Mock for @react-native-firebase/auth
const mockUser = {
  uid: 'mock-uid',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  getIdToken: jest.fn(() => Promise.resolve('mock-token')),
};

const auth = () => ({
  currentUser: mockUser,
  signInWithEmailAndPassword: jest.fn(() =>
    Promise.resolve({ user: mockUser })
  ),
  createUserWithEmailAndPassword: jest.fn(() =>
    Promise.resolve({ user: mockUser })
  ),
  signOut: jest.fn(() => Promise.resolve()),
  onAuthStateChanged: jest.fn((callback) => {
    callback(mockUser);
    return jest.fn(); // unsubscribe
  }),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
});

auth.PhoneAuthState = {
  CODE_SENT: 'sent',
  AUTO_VERIFY_TIMEOUT: 'timeout',
  AUTO_VERIFIED: 'verified',
  ERROR: 'error',
};

export default auth;
