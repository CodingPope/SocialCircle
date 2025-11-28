import { db, FieldValue, Timestamp } from './config';

function coerceExists(snapshot) {
  if (!snapshot) return false;
  // Native SDK exposes boolean property; web compat expects a function.
  const existsValue =
    typeof snapshot._exists === 'boolean'
      ? snapshot._exists
      : typeof snapshot.exists === 'function'
      ? snapshot.exists()
      : typeof snapshot.exists === 'boolean'
      ? snapshot.exists
      : undefined;

  if (typeof existsValue === 'boolean') {
    return existsValue;
  }

  try {
    if (typeof snapshot.data === 'function') {
      return snapshot.data() !== undefined;
    }
    return snapshot.data !== undefined;
  } catch {
    return false;
  }
}

function attachExistsHelpers(snapshot) {
  if (!snapshot || snapshot.__compatExistsAttached) {
    return snapshot;
  }

  const existsBool = coerceExists(snapshot);

  try {
    Object.defineProperty(snapshot, 'exists', {
      value: existsBool,
      writable: false,
      configurable: true,
      enumerable: true,
    });
  } catch {
    try {
      snapshot.exists = existsBool;
    } catch {
      // Ignore if the property is read-only
    }
  }

  if (typeof snapshot.existsCompat !== 'function') {
    Object.defineProperty(snapshot, 'existsCompat', {
      value: () => existsBool,
      configurable: true,
      enumerable: false,
    });
  }

  Object.defineProperty(snapshot, '__compatExistsAttached', {
    value: true,
    configurable: true,
    enumerable: false,
  });

  return snapshot;
}

function snapshotExists(snapshot) {
  return coerceExists(snapshot);
}

function ensureDb(instance) {
  if (instance && typeof instance.collection === 'function') {
    return instance;
  }
  return db;
}

function normalizeSegments(segments) {
  return segments.flat().filter((segment) => segment != null);
}

function buildCollectionRef(instance, segments) {
  const normalized = normalizeSegments(segments);
  if (normalized.length === 0) {
    throw new Error('collection() requires at least one path segment');
  }
  let ref = instance.collection(normalized[0]);
  for (let i = 1; i < normalized.length; i += 2) {
    const docId = normalized[i];
    const colName = normalized[i + 1];
    if (docId == null) {
      break;
    }
    ref = ref.doc(docId);
    if (colName != null) {
      ref = ref.collection(colName);
    }
  }
  return ref;
}

function buildDocRef(instance, segments) {
  const normalized = normalizeSegments(segments);
  if (normalized.length < 2) {
    // Fallback to doc(path)
    const path = normalized.join('/');
    return instance.doc(path);
  }
  let ref = instance.collection(normalized[0]).doc(normalized[1]);
  for (let i = 2; i < normalized.length; i += 2) {
    const colName = normalized[i];
    const docId = normalized[i + 1];
    if (colName == null || docId == null) break;
    ref = ref.collection(colName).doc(docId);
  }
  return ref;
}

export function collection(instance, ...segments) {
  const dbInstance = ensureDb(instance);
  return buildCollectionRef(dbInstance, segments);
}

export function doc(instance, ...segments) {
  const dbInstance = ensureDb(instance);
  return buildDocRef(dbInstance, segments);
}

export function query(ref, ...constraints) {
  return constraints.reduce(
    (acc, applyConstraint) => applyConstraint(acc),
    ref
  );
}

export function where(field, opStr, value) {
  return (ref) => ref.where(field, opStr, value);
}

export function orderBy(field, directionStr) {
  return (ref) => ref.orderBy(field, directionStr);
}

export function limit(count) {
  return (ref) => ref.limit(count);
}

export function startAfter(...args) {
  return (ref) => ref.startAfter(...args);
}

export function getDoc(ref) {
  return ref.get().then((snapshot) => {
    attachExistsHelpers(snapshot);
    return snapshot;
  });
}

export function getDocs(ref) {
  return ref.get().then((querySnapshot) => {
    // Description: Wrap query snapshot to add exists() method compatibility for Web SDK syntax
    const wrappedDocs = querySnapshot.docs.map((doc) => {
      attachExistsHelpers(doc);
      return doc;
    });
    return {
      ...querySnapshot,
      docs: wrappedDocs,
      forEach: (callback) => wrappedDocs.forEach(callback),
    };
  });
}

export function addDoc(collectionRef, data) {
  return collectionRef.add(data);
}

export function setDoc(docRef, data, options) {
  if (options) {
    return docRef.set(data, options);
  }
  return docRef.set(data);
}

export function updateDoc(docRef, data) {
  return docRef.update(data);
}

export function deleteDoc(docRef) {
  return docRef.delete();
}

export function writeBatch(instance) {
  const dbInstance = ensureDb(instance);
  return dbInstance.batch();
}

function isObserverArg(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false;
  }

  const next = candidate.next || candidate.onNext;
  const error = candidate.error || candidate.onError;
  const complete = candidate.complete || candidate.onCompletion;

  return [next, error, complete].some((fn) => typeof fn === 'function');
}

function isOptionsArg(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false;
  }

  if (isObserverArg(candidate)) {
    return false;
  }

  const optionKeys = ['includeMetadataChanges', 'source'];
  return optionKeys.some((key) =>
    Object.prototype.hasOwnProperty.call(candidate, key)
  );
}

function wrapSnapshotCallback(callback) {
  if (typeof callback !== 'function') {
    return undefined;
  }

  return (snapshot) => {
    if (snapshot?.docs) {
      const wrappedDocs = snapshot.docs.map((doc) => {
        attachExistsHelpers(doc);
        return doc;
      });

      callback({
        ...snapshot,
        docs: wrappedDocs,
        forEach: (cb) => wrappedDocs.forEach(cb),
      });
      return;
    }

    attachExistsHelpers(snapshot);
    callback(snapshot);
  };
}

export function onSnapshot(ref, ...args) {
  if (!ref || typeof ref.onSnapshot !== 'function') {
    throw new Error('onSnapshot requires a valid document or query reference');
  }

  if (!args.length) {
    throw new Error('onSnapshot requires at least one callback argument');
  }

  let options = null;
  let observer = null;
  let onNext;
  let onError;
  let onCompletion;

  let index = 0;

  if (isOptionsArg(args[index])) {
    options = args[index];
    index += 1;
  }

  if (isObserverArg(args[index])) {
    observer = args[index];
  } else {
    onNext = args[index];
    onError = args[index + 1];
    onCompletion = args[index + 2];
  }

  if (observer) {
    const wrappedObserver = { ...observer };
    const nextFn = observer.next || observer.onNext;
    wrappedObserver.next = wrapSnapshotCallback(nextFn);

    if (typeof observer.error === 'function') {
      wrappedObserver.error = observer.error.bind(observer);
    } else if (typeof observer.onError === 'function') {
      wrappedObserver.error = observer.onError.bind(observer);
    }

    if (typeof observer.complete === 'function') {
      wrappedObserver.complete = observer.complete.bind(observer);
    } else if (typeof observer.onCompletion === 'function') {
      wrappedObserver.complete = observer.onCompletion.bind(observer);
    }

    return options
      ? ref.onSnapshot(options, wrappedObserver)
      : ref.onSnapshot(wrappedObserver);
  }

  const wrappedOnNext = wrapSnapshotCallback(onNext);

  if (!wrappedOnNext) {
    throw new Error('onSnapshot requires a valid next callback function');
  }

  return options
    ? ref.onSnapshot(options, wrappedOnNext, onError, onCompletion)
    : ref.onSnapshot(wrappedOnNext, onError, onCompletion);
}

export const serverTimestamp = () => FieldValue.serverTimestamp();
export const arrayUnion = (...values) => FieldValue.arrayUnion(...values);
export const arrayRemove = (...values) => FieldValue.arrayRemove(...values);
export const deleteField = () => FieldValue.delete();
export const increment = (value) => FieldValue.increment(value);
export { Timestamp };
export const docExists = (snapshot) => snapshotExists(snapshot);

export default {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  increment,
  Timestamp,
};
