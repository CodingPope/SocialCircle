#!/usr/bin/env node

/**
 * One-time script to mark your user as having a business account
 * This sets user.type = 'business' in Firestore
 *
 * Usage: node scripts/mark-user-as-business.js <your-user-id>
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function markUserAsBusiness(uid) {
  if (!uid) {
    console.error('❌ Error: User ID is required');
    console.log('Usage: node scripts/mark-user-as-business.js <your-user-id>');
    process.exit(1);
  }

  try {
    console.log(`🔍 Checking user: ${uid}`);

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      console.error(`❌ Error: User ${uid} not found in Firestore`);
      process.exit(1);
    }

    const userData = userSnap.data();
    console.log(`📋 Current user type: ${userData.type || 'not set'}`);

    // Check if user has any businesses
    const businessesSnap = await db
      .collection('businesses')
      .where('ownerId', '==', uid)
      .limit(1)
      .get();

    if (businessesSnap.empty) {
      console.log('⚠️  Warning: No businesses found for this user');
      console.log('   This user may not have created a business account yet.');
    } else {
      const bizId = businessesSnap.docs[0].id;
      const bizData = businessesSnap.docs[0].data();
      console.log(
        `✅ Found business: ${
          bizData.displayName || bizData.legalName || bizId
        }`
      );
    }

    if (userData.type === 'business') {
      console.log('✅ User already marked as business - no update needed');
      process.exit(0);
    }

    // Update the user document
    await userRef.set(
      {
        type: 'business',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log('✅ Successfully marked user as business!');
    console.log(
      '   The "Account Type" button will now show "Switch to Business"'
    );
    console.log('   Restart your app to see the change.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get UID from command line argument
const uid = process.argv[2];
markUserAsBusiness(uid)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
