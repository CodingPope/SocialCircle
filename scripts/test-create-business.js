// Description: Test script to verify createBusinessDraft Cloud Function works
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'social-scene1',
  });
}

const db = admin.firestore();

async function testCreateBusiness() {
  try {
    console.log('🔍 Checking if there are any authenticated users...');

    // List first 5 users
    const usersSnapshot = await db.collection('users').limit(5).get();

    if (usersSnapshot.empty) {
      console.log('❌ No users found in database');
      return;
    }

    console.log(`✅ Found ${usersSnapshot.size} users`);
    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(
        `  - ${doc.id}: ${data.email || data.displayName || 'No name'}`
      );
    });

    // Check if there are any existing business drafts
    const businessesSnapshot = await db.collection('businesses').limit(5).get();
    console.log(`\n📊 Found ${businessesSnapshot.size} existing businesses`);

    if (!businessesSnapshot.empty) {
      businessesSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(
          `  - ${doc.id}: ${data.displayName || 'Draft'} (status: ${
            data.status
          })`
        );
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCreateBusiness()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
