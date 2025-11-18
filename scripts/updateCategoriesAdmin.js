#!/usr/bin/env node

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin (it will use the default credentials from Firebase CLI)
admin.initializeApp({
  projectId: 'social-scene1',
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// Load categories from the centralized source
const categoriesData = require('../src/features/events/constants/categoriesData.json');

/**
 * Description: Updates all categories in Firestore from categoriesData.json
 */
async function updateCategories() {
  try {
    const categoriesRef = db.collection('categories');

    console.log('Clearing existing categories...');
    const existing = await categoriesRef.listDocuments();

    // Delete in batches of 500 (Firestore limit)
    for (let i = 0; i < existing.length; i += 500) {
      const chunk = existing.slice(i, i + 500);
      const batch = db.batch();
      chunk.forEach((docRef) => batch.delete(docRef));
      await batch.commit();
      console.log(`Deleted batch ${Math.floor(i / 500) + 1}`);
    }

    console.log('Adding new categories...');
    let batch = db.batch();
    let writes = 0;

    for (const category of categoriesData) {
      const docRef = categoriesRef.doc(category.id);
      batch.set(docRef, {
        name: category.name?.trim() || '',
        emoji: category.emoji?.trim() || '',
        interests: (category.interests || []).map((interest) => ({
          name: interest.name?.trim() || '',
          count_selected: Number(interest.count_selected) || 0,
          count_event_matches: Number(interest.count_event_matches) || 0,
          count_event_views: Number(interest.count_event_views) || 0,
          count_event_joins: Number(interest.count_event_joins) || 0,
          last_activity: interest.last_activity || null,
        })),
        updatedAt: FieldValue.serverTimestamp(),
      });

      writes += 1;

      // Commit batch every 500 writes (Firestore limit)
      if (writes % 500 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`Added batch ${writes / 500}`);
      }
    }

    // Commit remaining writes
    if (writes % 500 !== 0) {
      await batch.commit();
    }

    console.log(`Successfully updated ${writes} categories`);
    process.exit(0);
  } catch (error) {
    console.error('Error updating categories:', error);
    process.exit(1);
  }
}

updateCategories();
