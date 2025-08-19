export const getFirestore = () => ({ mock: true });
export const collection = () => ({});
export const doc = () => ({});
export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
export const updateDoc = async () => {};
export const addDoc = async () => {};
export const query = () => ({});
export const where = () => ({});
export const getDocs = async () => ({ docs: [] });
export const Timestamp = {
  now: () => ({ seconds: Math.floor(Date.now() / 1000) }),
  fromMillis: (ms) => ({ seconds: Math.floor(ms / 1000) }),
};
