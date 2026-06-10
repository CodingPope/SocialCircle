import { db, FieldValue, Timestamp } from './config';
import {
  collection as _collection,
  doc as _doc,
  query as _query,
  where as _where,
  orderBy as _orderBy,
  limit as _limit,
  startAfter as _startAfter,
  getDocs as _getDocs,
  getDoc as _getDoc,
  addDoc as _addDoc,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  deleteDoc as _deleteDoc,
  writeBatch as _writeBatch,
  onSnapshot as _onSnapshot,
  serverTimestamp as _serverTimestamp,
  arrayUnion as _arrayUnion,
  arrayRemove as _arrayRemove,
  deleteField as _deleteField,
  increment as _increment,
} from '@react-native-firebase/firestore';

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

// Description: Use modular API functions; they pass MODULAR_DEPRECATION_ARG internally,
// suppressing the @react-native-firebase deprecation warnings from namespaced calls.
export function collection(instance, ...segments) {
  const dbInstance = ensureDb(instance);
  const normalized = normalizeSegments(segments);
  if (normalized.length === 0) {
    throw new Error('collection() requires at least one path segment');
  }
  return _collection(dbInstance, normalized.join('/'));
}

export function doc(instance, ...segments) {
  const dbInstance = ensureDb(instance);
  const normalized = normalizeSegments(segments);
  if (normalized.length === 0) {
    throw new Error('doc() requires at least one path segment');
  }
  return _doc(dbInstance, normalized.join('/'));
}

export const query = _query;
export const where = _where;
export const orderBy = _orderBy;
export const limit = _limit;
export const startAfter = _startAfter;

export function getDoc(ref) {
  return _getDoc(ref).then((snapshot) => {
    attachExistsHelpers(snapshot);
    return snapshot;
  });
}

export function getDocs(ref) {
  return _getDocs(ref).then((querySnapshot) => {
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
  return _addDoc(collectionRef, data);
}

export function setDoc(docRef, data, options) {
  return _setDoc(docRef, data, options);
}

export function updateDoc(docRef, data) {
  return _updateDoc(docRef, data);
}

export function deleteDoc(docRef) {
  return _deleteDoc(docRef);
}

export function writeBatch(instance) {
  const dbInstance = ensureDb(instance);
  return _writeBatch(dbInstance);
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
      ? _onSnapshot(ref, options, wrappedObserver)
      : _onSnapshot(ref, wrappedObserver);
  }

  const wrappedOnNext = wrapSnapshotCallback(onNext);

  if (!wrappedOnNext) {
    throw new Error('onSnapshot requires a valid next callback function');
  }

  return options
    ? _onSnapshot(ref, options, wrappedOnNext, onError, onCompletion)
    : _onSnapshot(ref, wrappedOnNext, onError, onCompletion);
}

export const serverTimestamp = () => _serverTimestamp();
export const arrayUnion = (...values) => _arrayUnion(...values);
export const arrayRemove = (...values) => _arrayRemove(...values);
export const deleteField = () => _deleteField();
export const increment = (value) => _increment(value);
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
