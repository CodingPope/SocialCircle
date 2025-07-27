import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import categories from './src/utils/categoriesData.json' assert { type: 'json' };

// ✅ Your Firebase Config
const firebaseConfig = {
  apiKey: '***REMOVED_GOOGLE_API_KEY***',
  authDomain: 'social-scene1.firebaseapp.com',
  projectId: 'social-scene1',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ✅ Safe write function
const safeString = (val) =>
  typeof val === 'string' && val.trim().length > 0 ? val.trim() : 'unknown';

(async function seed() {
  for (const category of categories) {
    const categoryRef = doc(db, 'categories', category.id);
    await setDoc(categoryRef, {
      name: category.name,
    });

    for (const activity of category.activities) {
      const activityRef = doc(
        db,
        `categories/${category.id}/activities`,
        activity.id
      );
      await setDoc(activityRef, {
        name: activity.name,
      });
    }
  }
  console.log('✅ Seeding complete!');
  process.exit();
})();
