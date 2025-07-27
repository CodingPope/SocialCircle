import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Description: Fetches the current user's interests from Firestore
export async function fetchUserInterests() {
  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      throw new Error('No authenticated user found');
    }

    const db = getFirestore();
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      // Replace underscores with spaces in interest names
      return (userData.interests || []).map((interest) =>
        interest.replace(/_/g, ' ')
      );
    } else {
      throw new Error('User document does not exist');
    }
  } catch (error) {
    console.error('Error fetching user interests:', error);
    return []; // Return an empty array on error
  }
}
