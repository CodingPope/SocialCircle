// Description: One-time script to recalculate interest counts from all user data
// Run this after deploying the new cloud function to sync existing data

const admin = require('firebase-admin');

// Initialize Firebase Admin (it will use the default credentials from Firebase CLI)
admin.initializeApp({
  projectId: 'social-scene1',
});

const db = admin.firestore();

async function recalculateInterestCounts() {
  try {
    console.log('Fetching all users...');
    const usersSnapshot = await db.collection('users').get();

    // Count how many times each interest is selected across all users
    const interestCounts = new Map();

    usersSnapshot.docs.forEach((userDoc) => {
      const userData = userDoc.data();
      const interests = Array.isArray(userData.interests)
        ? userData.interests
        : [];

      interests.forEach((interest) => {
        const count = interestCounts.get(interest) || 0;
        interestCounts.set(interest, count + 1);
      });
    });

    console.log(`Counted interests from ${usersSnapshot.size} users`);
    console.log(`Found ${interestCounts.size} unique interests`);

    // Update categories with the counts
    console.log('Updating categories...');
    const categoriesSnapshot = await db.collection('categories').get();

    const batch = db.batch();
    let updatedCount = 0;

    categoriesSnapshot.docs.forEach((categoryDoc) => {
      const categoryData = categoryDoc.data();
      const interests = categoryData.interests || [];

      const updatedInterests = interests.map((interest) => {
        const interestName =
          typeof interest === 'string' ? interest : interest.name;
        const count = interestCounts.get(interestName) || 0;

        if (typeof interest === 'string') {
          return {
            name: interest,
            count_selected: count,
            count_event_matches: 0,
            count_event_views: 0,
            count_event_joins: 0,
            last_activity: null,
          };
        }

        return {
          ...interest,
          count_selected: count,
        };
      });

      batch.update(categoryDoc.ref, {
        interests: updatedInterests,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      updatedCount++;
    });

    await batch.commit();
    console.log(`Successfully updated ${updatedCount} categories`);

    // Display top interests
    const topInterests = Array.from(interestCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    console.log('\nTop 20 interests:');
    topInterests.forEach(([interest, count], index) => {
      console.log(`${index + 1}. ${interest}: ${count} users`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error recalculating interest counts:', error);
    process.exit(1);
  }
}

recalculateInterestCounts();
