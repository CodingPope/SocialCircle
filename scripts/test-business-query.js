// Description: Test script to verify the businesses query works after index is built
const admin = require('firebase-admin');

// Initialize Firebase Admin (make sure you have credentials set up)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'social-scene1',
  });
}

const db = admin.firestore();

async function testBusinessQuery() {
  try {
    console.log(
      'Testing businesses query with ownerId and orderBy createdAt...'
    );

    // This is the same query that's failing in the app
    const testUid = 'test-user-id'; // Replace with a real UID if you want to test
    const query = await db
      .collection('businesses')
      .where('ownerId', '==', testUid)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    console.log(`✅ Query successful! Found ${query.size} documents`);

    if (!query.empty) {
      query.docs.forEach((doc, i) => {
        console.log(
          `  ${i + 1}. ${doc.id} - ${doc.data().displayName || 'No name'}`
        );
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Query failed:', error.message);
    if (error.message.includes('index')) {
      console.log(
        '\n⏳ The index is still building. Wait 2-5 minutes and try again.'
      );
    }
    return false;
  }
}

testBusinessQuery()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
