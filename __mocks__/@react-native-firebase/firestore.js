// Mock for @react-native-firebase/firestore
const mockDoc = {
  id: 'mock-doc-id',
  data: () => ({ mock: 'data' }),
  exists: true,
  get: jest.fn((field) => ({ mock: 'data' }[field])),
};

const mockSnapshot = {
  docs: [mockDoc],
  empty: false,
  size: 1,
  forEach: jest.fn((callback) => [mockDoc].forEach(callback)),
};

const mockDocRef = {
  id: 'mock-doc-id',
  get: jest.fn(() => Promise.resolve(mockDoc)),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  delete: jest.fn(() => Promise.resolve()),
  onSnapshot: jest.fn((callback) => {
    callback(mockDoc);
    return jest.fn(); // unsubscribe
  }),
  collection: jest.fn(() => mockCollectionRef),
};

const mockCollectionRef = {
  doc: jest.fn((id) => mockDocRef),
  add: jest.fn(() => Promise.resolve(mockDocRef)),
  get: jest.fn(() => Promise.resolve(mockSnapshot)),
  where: jest.fn(() => mockCollectionRef),
  orderBy: jest.fn(() => mockCollectionRef),
  limit: jest.fn(() => mockCollectionRef),
  onSnapshot: jest.fn((callback) => {
    callback(mockSnapshot);
    return jest.fn(); // unsubscribe
  }),
};

const firestore = () => ({
  collection: jest.fn(() => mockCollectionRef),
  doc: jest.fn(() => mockDocRef),
  batch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  })),
  runTransaction: jest.fn((updateFunction) =>
    Promise.resolve(
      updateFunction({
        get: jest.fn(() => Promise.resolve(mockDoc)),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })
    )
  ),
  settings: jest.fn(),
});

firestore.FieldValue = {
  serverTimestamp: jest.fn(() => ({
    _methodName: 'FieldValue.serverTimestamp',
  })),
  delete: jest.fn(() => ({ _methodName: 'FieldValue.delete' })),
  increment: jest.fn((n) => ({
    _methodName: 'FieldValue.increment',
    _value: n,
  })),
  arrayUnion: jest.fn((...elements) => ({
    _methodName: 'FieldValue.arrayUnion',
    _elements: elements,
  })),
  arrayRemove: jest.fn((...elements) => ({
    _methodName: 'FieldValue.arrayRemove',
    _elements: elements,
  })),
};

firestore.Timestamp = {
  now: jest.fn(() => ({
    toDate: () => new Date(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0,
  })),
  fromDate: jest.fn((date) => ({
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  })),
};

firestore.GeoPoint = class {
  constructor(latitude, longitude) {
    this.latitude = latitude;
    this.longitude = longitude;
  }
};

export default firestore;
