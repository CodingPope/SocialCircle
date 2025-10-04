#!/usr/bin/env node

const { initializeApp } = require('firebase/app');
const {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} = require('firebase/functions');
const { getAuth, signInAnonymously } = require('firebase/auth');
const path = require('path');

// Firebase config - using the same project ID
const firebaseConfig = {
  projectId: 'social-scene1',
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const auth = getAuth(app);

// Load categories data
const categoriesData = require('./categories.json');

async function updateCategories() {
  try {
    console.log('Signing in anonymously...');
    await signInAnonymously(auth);
    console.log('Successfully signed in');

    console.log('Calling updateCategories function...');
    const updateCategoriesFunction = httpsCallable(
      functions,
      'updateCategories'
    );

    const result = await updateCategoriesFunction({
      categories: categoriesData,
    });

    console.log('Success:', result.data);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateCategories();
