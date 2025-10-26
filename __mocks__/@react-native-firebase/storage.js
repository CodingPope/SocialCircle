// Mock for @react-native-firebase/storage
const mockRef = {
  putFile: jest.fn(() => ({
    on: jest.fn(),
    then: jest.fn(() => Promise.resolve()),
  })),
  put: jest.fn(() => Promise.resolve()),
  getDownloadURL: jest.fn(() =>
    Promise.resolve('https://mock-url.com/image.jpg')
  ),
  delete: jest.fn(() => Promise.resolve()),
};

const storage = () => ({
  ref: jest.fn(() => mockRef),
  refFromURL: jest.fn(() => mockRef),
  setMaxUploadRetryTime: jest.fn(),
  setMaxDownloadRetryTime: jest.fn(),
  setMaxOperationRetryTime: jest.fn(),
});

export default storage;
