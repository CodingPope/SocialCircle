// Description: Test Firebase Auth directly to diagnose issues
import auth from '@react-native-firebase/auth';
import { db } from './config';

/**
 * Test Firebase connectivity and auth configuration
 * Call this from your app to diagnose issues
 */
export async function testFirebaseAuth() {
  console.log('🧪 Testing Firebase Authentication...\n');

  // Test 1: Check if auth module is loaded
  try {
    const authInstance = auth();
    console.log('✅ Auth module loaded:', authInstance.app.name);
  } catch (error) {
    console.log('❌ Auth module failed:', error.message);
    return;
  }

  // Test 2: Check current user
  try {
    const currentUser = auth().currentUser;
    console.log(
      'Current user:',
      currentUser ? currentUser.email : 'Not logged in'
    );
  } catch (error) {
    console.log('❌ Current user check failed:', error.message);
  }

  // Test 3: Try to sign in with known credentials
  console.log('\n🔐 Testing login with qwer@gmail.com...');
  try {
    // REPLACE 'test123' with the actual password
    const result = await auth().signInWithEmailAndPassword(
      'qwer@gmail.com',
      'test123' // ← CHANGE THIS TO ACTUAL PASSWORD
    );
    console.log('✅ Login successful!');
    console.log('   User ID:', result.user.uid);
    console.log('   Email:', result.user.email);

    // Sign out after test
    await auth().signOut();
    console.log('✅ Signed out successfully');
  } catch (error) {
    console.log('❌ Login failed:');
    console.log('   Code:', error.code);
    console.log('   Message:', error.message);
    console.log('   Native:', error.nativeErrorMessage);

    // Specific error guidance
    if (error.code === 'auth/internal-error') {
      console.log('\n⚠️  INTERNAL ERROR - Likely causes:');
      console.log('   1. Email/Password auth NOT enabled in Firebase Console');
      console.log('   2. Network connectivity issue');
      console.log('   3. Firebase project misconfiguration');
      console.log(
        '\n   → Check: https://console.firebase.google.com/project/social-scene1/authentication/providers'
      );
    } else if (error.code === 'auth/wrong-password') {
      console.log('\n⚠️  Wrong password - try another test user');
    } else if (error.code === 'auth/user-not-found') {
      console.log('\n⚠️  User not found - check Firebase Console users list');
    }
  }

  // Test 4: Check Firestore connectivity
  console.log('\n📊 Testing Firestore...');
  try {
    const testDoc = await db.collection('categories').limit(1).get();
    console.log('✅ Firestore connected, found', testDoc.size, 'documents');
  } catch (error) {
    console.log('❌ Firestore failed:', error.message);
  }
}

/**
 * Test signup with a new user
 */
export async function testFirebaseSignup() {
  console.log('🧪 Testing Firebase Signup...\n');

  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'testPassword123';

  try {
    const result = await auth().createUserWithEmailAndPassword(
      testEmail,
      testPassword
    );
    console.log('✅ Signup successful!');
    console.log('   User ID:', result.user.uid);
    console.log('   Email:', result.user.email);

    // Clean up - delete test user
    await result.user.delete();
    console.log('✅ Test user deleted');
  } catch (error) {
    console.log('❌ Signup failed:');
    console.log('   Code:', error.code);
    console.log('   Message:', error.message);
    console.log('   Native:', error.nativeErrorMessage);
  }
}
