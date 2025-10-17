import { auth, db } from '../../../firebase/config';

// Description: Fetches the current user's interests from Firestore
export async function fetchUserInterests() {
  try {
    const user = auth().currentUser;

    if (!user) {
      throw new Error('No authenticated user found');
    }

    const userDocRef = db.collection('users').doc(user.uid);
    const userDoc = await userDocRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      return userData.interests || []; // Ensure interests are returned as an array
    } else {
      throw new Error('User document does not exist');
    }
  } catch (error) {
    console.error('Error fetching user interests:', error);
    return [];
  }
}

// Description: Fetches user data by their ID from Firestore
export async function fetchUserById(userId) {
  try {
    const userDocRef = db.collection('users').doc(userId);
    const userDoc = await userDocRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      return {
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        profileImage: userData.profileImage || null,
        rating: userData.rating || 0,
      }; // Ensure the returned data matches the schema
    } else {
      throw new Error(`User document with ID ${userId} does not exist`);
    }
  } catch (error) {
    console.error(`Error fetching user by ID (${userId}):`, error);
    throw error; // Re-throw the error for the caller to handle
  }
}
