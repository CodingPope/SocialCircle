import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';
const categories = JSON.parse(
  fs.readFileSync('./src/utils/categoriesData.json', 'utf-8')
);

// ✅ Your Firebase Config
const firebaseConfig = {
  apiKey: '***REMOVED_GOOGLE_API_KEY***',
  authDomain: 'social-scene1.firebaseapp.com',
  projectId: 'social-scene1',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ✅ Utility function
const safeString = (val) =>
  typeof val === 'string' && val.trim().length > 0 ? val.trim() : 'unknown';

(async function seed() {
  for (const category of categories) {
    const categoryRef = doc(db, 'categories', category.id);
    await setDoc(categoryRef, {
      name: safeString(category.name),
      emoji: safeString(category.emoji),
      interests: category.interests.map((interest) => ({
        name: safeString(interest.name),
        count_selected: interest.count_selected || 0,
        count_event_matches: interest.count_event_matches || 0,
        count_event_views: interest.count_event_views || 0,
        count_event_joins: interest.count_event_joins || 0,
        last_activity: interest.last_activity || null,
      })),
    });
  }

  console.log('✅ Categories seeded with embedded interests!');
  process.exit();
})();
