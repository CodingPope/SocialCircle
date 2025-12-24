// Description: Test Firebase Auth directly to diagnose issues
import auth from '@react-native-firebase/auth';
import { db } from './config';
import logger from '../../lib/logger';

/**
 * Test Firebase connectivity and auth configuration
 * Call this from your app to diagnose issues
 */
export async function testFirebaseAuth() {
  logger.debug('🧪 Testing Firebase Authentication...\n');

  // Test 1: Check if auth module is loaded
  try {
    const authInstance = auth();
    logger.debug('✅ Auth module loaded:', authInstance.app.name);
  } catch (error) {
    logger.error('❌ Auth module failed:', error.message);
    return;
  }

  // Test 2: Check current user
  try {
    const currentUser = auth().currentUser;
    logger.debug(
      'Current user:',
      currentUser ? 'Authenticated' : 'Not logged in'
    );
  } catch (error) {
    logger.error('❌ Current user check failed:', error.message);
  }

  // Test 3: Try to sign in with known credentials
  logger.debug('\n🔐 Testing login...');
  try {
    // REPLACE 'test123' with the actual password
    const result = await auth().signInWithEmailAndPassword(
      'qwer@gmail.com',
      'test123' // ← CHANGE THIS TO ACTUAL PASSWORD
    );
    logger.debug('✅ Login successful!');
    logger.debug('   User authenticated (ID/email redacted in production)');

    // Sign out after test
    await auth().signOut();
    logger.debug('✅ Signed out successfully');
  } catch (error) {
    logger.error('❌ Login failed:', error.code);
    logger.debug('   Code:', error.code);
    logger.debug('   Message:', error.message);

    // Specific error guidance
    if (error.code === 'auth/internal-error') {
      logger.debug('\n⚠️  INTERNAL ERROR - Likely causes:');
      logger.debug('   1. Email/Password auth NOT enabled in Firebase Console');
      logger.debug('   2. Network connectivity issue');
      logger.debug('   3. Firebase project misconfiguration');
    } else if (error.code === 'auth/wrong-password') {
      logger.debug('\n⚠️  Wrong password - try another test user');
    } else if (error.code === 'auth/user-not-found') {
      logger.debug('\n⚠️  User not found - check Firebase Console users list');
    }
  }

  // Test 4: Check Firestore connectivity
  logger.debug('\n📊 Testing Firestore...');
  try {
    const testDoc = await db.collection('categories').limit(1).get();
    logger.debug('✅ Firestore connected, found', testDoc.size, 'documents');
  } catch (error) {
    logger.error('❌ Firestore failed:', error.message);
  }
}

/**
 * Test signup with a new user
 */
export async function testFirebaseSignup() {
  logger.debug('🧪 Testing Firebase Signup...\n');

  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'testPassword123';

  try {
    const result = await auth().createUserWithEmailAndPassword(
      testEmail,
      testPassword
    );
    logger.debug('✅ Signup successful!');
    logger.debug('   Test user created (ID/email redacted in production)');

    // Clean up - delete test user
    await result.user.delete();
    logger.debug('✅ Test user deleted');
  } catch (error) {
    console.log('❌ Signup failed:');
    console.log('   Code:', error.code);
    console.log('   Message:', error.message);
    console.log('   Native:', error.nativeErrorMessage);
  }
}
