import {
  addDoc,
  arrayUnion,
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  updateDoc,
  where,
} from '../../../services/firebase/firestoreCompat';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  auth,
  db,
  storage,
  getTimestampNow,
} from '../../../services/firebase';
import {
  interpretStorageError,
  logStorageDiagnostic,
} from '../../../services/firebase/storageUtils';
import logger from '../../../lib/logger';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_LENGTH = 2000;

function getCollection() {
  return collection(db, 'interestPosts');
}

function getCommentsCollection(postId) {
  return collection(db, 'interestPosts', postId, 'comments');
}

async function getCurrentUser() {
  const user = auth().currentUser;
  if (!user) throw new Error('User must be signed in');
  return user;
}

async function fetchUserSnapshot(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists) throw new Error('User document missing');
  const data = snap.data();
  return {
    displayName: [data.firstName, data.lastName]
      .filter(Boolean)
      .join(' ')
      .trim(),
    avatarUrl: data.profileImage || null,
    rating: typeof data.rating === 'number' ? data.rating : null,
  };
}

async function compressImageAsync(uri) {
  if (!uri) return null;
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1440 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    const thumbnailResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 512 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );

    return {
      image: manipResult,
      thumbnail: thumbnailResult,
    };
  } catch (error) {
    logger.warn('compressImageAsync failed, using original image', error);
    return null;
  }
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

async function uploadImage({
  fileUri,
  thumbnailUri,
  storagePath,
  contentType = 'image/jpeg',
}) {
  const uploadSingle = async (uri, suffix) => {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error('Image exceeds maximum size of 10MB');
    }
    const path = suffix ? `${storagePath}/${suffix}` : storagePath;
    const storageRef = storage.ref(path);
    try {
      await storageRef.putFile(uri, { contentType });
      const url = await storageRef.getDownloadURL();
      return { url, path, size: blob.size };
    } catch (error) {
      const interpreted = interpretStorageError(error, {
        context: 'interest-post-upload',
        path,
      });
      logStorageDiagnostic('interest-post-upload', interpreted.details);
      const friendly = interpreted.needsConsoleFix
        ? 'Upload blocked: please re-link Firebase Storage in the console.'
        : interpreted.userMessage;
      const err = new Error(friendly || 'Failed to upload image');
      err.code = interpreted.code;
      err.details = interpreted.details;
      throw err;
    }
  };

  const [main, thumb] = await Promise.all([
    uploadSingle(fileUri, 'main.jpg'),
    uploadSingle(thumbnailUri, 'thumb.jpg'),
  ]);

  return {
    main,
    thumb,
  };
}

export async function createInterestPost({ content, interestId, media }) {
  const user = await getCurrentUser();
  const text = (content || '').trim();
  if (!text) throw new Error('Post content is required');
  if (text.length > MAX_TEXT_LENGTH) throw new Error('Post is too long');
  if (!interestId) throw new Error('Interest is required');

  const creatorSnapshot = await fetchUserSnapshot(user.uid);
  const localCreatedAt = getTimestampNow();
  const baseDoc = {
    creatorId: user.uid,
    creatorSnapshot,
    interestId,
    content: text,
    mediaType: media ? 'image' : 'none',
    mediaUrl: null,
    mediaThumbnailUrl: null,
    mediaStoragePath: null,
    mediaWidth: media?.width || null,
    mediaHeight: media?.height || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    commentCount: 0,
    likeCount: 0,
    isDeleted: false,
  };

  // Description: Create Firestore doc immediately so UI can show instant feedback
  const docRef = await addDoc(getCollection(), baseDoc);

  // Description: Return immediately with post ID - don't block on upload
  const returnValue = {
    id: docRef.id,
    ...baseDoc,
    createdAt: localCreatedAt,
    updatedAt: localCreatedAt,
    mediaUrl: null,
    mediaThumbnailUrl: null,
    mediaStoragePath: null,
  };

  // Description: Fire-and-forget background task for image compression + upload + user doc update
  (async () => {
    try {
      let uploaded = null;
      if (media?.uri) {
        const compressed = await compressImageAsync(media.uri);
        const storagePath = `interest-posts/${user.uid}/${docRef.id}`;
        uploaded = await uploadImage({
          fileUri: compressed?.image?.uri || media.uri,
          thumbnailUri: compressed?.thumbnail?.uri || media.uri,
          storagePath,
          contentType: media?.mimeType || 'image/jpeg',
        });

        await updateDoc(docRef, {
          mediaUrl: uploaded.main.url,
          mediaThumbnailUrl: uploaded.thumb.url,
          mediaStoragePath: storagePath,
          mediaSize: uploaded.main.size,
          mediaThumbSize: uploaded.thumb.size,
          mediaWidth: compressed?.image?.width || media.width || null,
          mediaHeight: compressed?.image?.height || media.height || null,
          updatedAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'users', user.uid), {
        createdInterestPosts: arrayUnion(docRef.id),
        lastInterestPostAt: serverTimestamp(),
      });
    } catch (bgErr) {
      logger.warn('Background post-create task failed (non-critical):', bgErr);
    }
  })();

  return returnValue;
}

export async function deleteInterestPost(postId) {
  const user = await getCurrentUser();
  const ref = doc(db, 'interestPosts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists) throw new Error('Post not found');
  if (snap.data().creatorId !== user.uid)
    throw new Error('You can only delete your own post');

  await updateDoc(ref, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'users', user.uid), {
    createdInterestPosts: arrayRemove(postId),
  });
}

export async function fetchInterestPostById(postId) {
  if (!postId) return null;
  const ref = doc(db, 'interestPosts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

export async function fetchInterestPostsByInterest({
  interestId,
  timeframe = 'week',
  pageSize = 20,
  cursor = null,
}) {
  if (!interestId) return { posts: [], cursor: null };

  let cutoff = null;
  const now = Date.now();
  if (timeframe === 'new') {
    cutoff = Timestamp.fromMillis(now - 24 * 60 * 60 * 1000);
  } else if (timeframe === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    cutoff = Timestamp.fromDate(start);
  } else {
    cutoff = Timestamp.fromMillis(now - 7 * 24 * 60 * 60 * 1000);
  }

  let q = query(
    getCollection(),
    where('interestId', '==', interestId),
    where('isDeleted', '==', false),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  if (cutoff) {
    q = query(q, where('createdAt', '>=', cutoff));
  }

  if (cursor) {
    q = query(q, startAfter(cursor));
  }

  const snapshot = await getDocs(q);
  const docs = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  const last = snapshot.docs[snapshot.docs.length - 1] || null;

  return { posts: docs, cursor: last };
}

export async function fetchInterestPostsByCreator({
  creatorId,
  pageSize = 20,
  cursor = null,
}) {
  if (!creatorId) return { posts: [], cursor: null };

  let q = query(
    getCollection(),
    where('creatorId', '==', creatorId),
    where('isDeleted', '==', false),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  if (cursor) {
    q = query(q, startAfter(cursor));
  }

  const snapshot = await getDocs(q);
  const docs = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  const last = snapshot.docs[snapshot.docs.length - 1] || null;

  return { posts: docs, cursor: last };
}

export async function fetchInterestPostsForInterests({
  interestIds = [],
  timeframe = 'week',
  pageSizePerInterest = 10,
}) {
  if (!Array.isArray(interestIds) || interestIds.length === 0) {
    return [];
  }

  const results = await Promise.all(
    interestIds.slice(0, 10).map((interestId) =>
      fetchInterestPostsByInterest({
        interestId,
        timeframe,
        pageSize: pageSizePerInterest,
      })
    )
  );

  const posts = results.flatMap((r) => r.posts || []);
  return posts.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function addCommentToPost(postId, body) {
  const user = await getCurrentUser();
  const text = (body || '').trim();
  if (!text) throw new Error('Comment cannot be empty');

  const userSnapshot = await fetchUserSnapshot(user.uid);
  const commentsRef = getCommentsCollection(postId);

  const commentDoc = {
    authorId: user.uid,
    authorSnapshot: userSnapshot,
    body: text,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deleted: false,
    likeCount: 0,
  };

  const docRef = await addDoc(commentsRef, commentDoc);

  await updateDoc(doc(db, 'interestPosts', postId), {
    commentCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  return { id: docRef.id, ...commentDoc };
}

export async function softDeleteComment(postId, commentId) {
  const user = await getCurrentUser();
  const ref = doc(db, 'interestPosts', postId, 'comments', commentId);
  const snap = await getDoc(ref);
  if (!snap.exists) throw new Error('Comment not found');
  const data = snap.data();
  if (data.authorId !== user.uid)
    throw new Error('You can only delete your comment');
  if (data.deleted) return;

  await updateDoc(ref, {
    deleted: true,
    deletedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'interestPosts', postId), {
    commentCount: increment(-1),
  });
}

export async function notifyPostComment() {
  // Temporarily disabled to avoid notification permission errors.
}

export function listenToComments(postId, { limitCount = 20, onUpdate }) {
  if (!postId) return () => {};
  const q = query(
    getCommentsCollection(postId),
    where('deleted', '==', false),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    onUpdate?.(comments, snapshot.docs[snapshot.docs.length - 1] || null);
  });

  return unsubscribe;
}

export async function fetchMoreComments(postId, cursor, limitCount = 20) {
  if (!postId || !cursor) return { comments: [], cursor: null };
  let q = query(
    getCommentsCollection(postId),
    where('deleted', '==', false),
    orderBy('createdAt', 'desc'),
    startAfter(cursor),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  const docs = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  const last = snapshot.docs[snapshot.docs.length - 1] || null;
  return { comments: docs, cursor: last };
}

export const InterestTimeframes = Object.freeze({
  NEW: 'new',
  TODAY: 'today',
  WEEK: 'week',
});

export { toMillis };
