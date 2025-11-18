#!/usr/bin/env node

const admin = require('firebase-admin');

// Description: Verify categories exist in Firestore
admin.initializeApp({
  projectId: 'social-scene1',
});

const db = admin.firestore();

async function verifyCategories() {
  try {
    console.log('Checking categories in Firestore...');
    const categoriesRef = db.collection('categories');
    const snapshot = await categoriesRef.get();

    if (snapshot.empty) {
      console.log('❌ No categories found in Firestore!');
      console.log('\nTo sync categories, run:');
      console.log('  node scripts/updateCategoriesAdmin.js');
      process.exit(1);
    }

    console.log(`✅ Found ${snapshot.size} categories in Firestore:\n`);

    snapshot.forEach((doc) => {
      const data = doc.data();
      const interestCount = data.interests?.length || 0;
      console.log(`  ${data.emoji} ${data.name} (${interestCount} interests)`);
    });

    console.log('\n✅ Categories are synced to Firestore!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking categories:', error);
    process.exit(1);
  }
}

verifyCategories();
