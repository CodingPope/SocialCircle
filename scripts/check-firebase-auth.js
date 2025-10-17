#!/usr/bin/env node
// Description: Check Firebase Authentication configuration
const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json'); // You'll need to add this

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('🔍 Checking Firebase Authentication Configuration...\n');

  // Check if Email/Password provider is enabled
  admin
    .auth()
    .listProviderConfigs()
    .then((configs) => {
      console.log('✅ Auth Providers:', configs);
    })
    .catch((error) => {
      console.log('❌ Error checking providers:', error.message);
    });

  // List first 5 users to verify users exist
  admin
    .auth()
    .listUsers(5)
    .then((listUsersResult) => {
      console.log('\n📋 First 5 users in Authentication:');
      if (listUsersResult.users.length === 0) {
        console.log('⚠️  NO USERS FOUND - You need to create a test user!');
      } else {
        listUsersResult.users.forEach((userRecord) => {
          console.log(`- ${userRecord.email} (${userRecord.uid})`);
          console.log(
            `  Providers: ${userRecord.providerData
              .map((p) => p.providerId)
              .join(', ')}`
          );
        });
      }
    })
    .catch((error) => {
      console.log('❌ Error listing users:', error.message);
    });
} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\n💡 To use this script:');
  console.log('1. Download service account key from Firebase Console');
  console.log('2. Save as service-account.json in project root');
  console.log('3. Run: node scripts/check-firebase-auth.js');
}
