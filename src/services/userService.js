import { getFirestore, doc, getDoc } from 'firebase/firestore';

// Description: Fetch user data by user ID from Firestore
export async function getUserById(userId) {
  try {
    const db = getFirestore();
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        ...userData,
        rating: userData.rating || 0, // Ensure rating is included, default to 0
      };
    } else {
      console.warn(`User with ID ${userId} not found.`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
}
