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

// Modular API mocks (e.g. `import { collection, query, where } from '@react-native-firebase/firestore'`)
export const collection = (instance, ...segments) => {
  let ref = instance.collection(segments[0]);
  for (let i = 1; i < segments.length; i += 2) {
    ref = ref.doc(segments[i]);
    if (segments[i + 1] != null) ref = ref.collection(segments[i + 1]);
  }
  return ref;
};

export const doc = (instance, ...segments) => {
  let ref = instance.collection(segments[0]).doc(segments[1]);
  for (let i = 2; i < segments.length; i += 2) {
    ref = ref.collection(segments[i]).doc(segments[i + 1]);
  }
  return ref;
};

export const query = (ref, ...constraints) =>
  constraints.reduce((acc, applyConstraint) => applyConstraint(acc), ref);

export const where = (field, opStr, value) => (ref) =>
  ref.where(field, opStr, value);

export const orderBy = (field, directionStr) => (ref) =>
  ref.orderBy(field, directionStr);

export const limit = (count) => (ref) => ref.limit(count);

export const getDocs = (ref) => ref.get();

export const getDoc = (ref) => ref.get();

export default firestore;
