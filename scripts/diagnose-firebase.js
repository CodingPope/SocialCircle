#!/usr/bin/env node
// Description: Diagnose Firebase configuration issues
const fs = require('fs');
const path = require('path');

console.log('🔍 Firebase Configuration Diagnostics\n');

// Check 1: GoogleService-Info.plist exists
const iosConfigPath = path.join(
  __dirname,
  '../ios/SocialCircle/GoogleService-Info.plist'
);
if (fs.existsSync(iosConfigPath)) {
  console.log('✅ iOS GoogleService-Info.plist found');
  const content = fs.readFileSync(iosConfigPath, 'utf8');

  // Extract key config values
  const projectId = content.match(
    /<key>PROJECT_ID<\/key>\s*<string>(.+?)<\/string>/
  )?.[1];
  const bundleId = content.match(
    /<key>BUNDLE_ID<\/key>\s*<string>(.+?)<\/string>/
  )?.[1];
  const apiKey = content.match(
    /<key>API_KEY<\/key>\s*<string>(.+?)<\/string>/
  )?.[1];

  console.log(`   Project ID: ${projectId || 'NOT FOUND'}`);
  console.log(`   Bundle ID: ${bundleId || 'NOT FOUND'}`);
  console.log(
    `   API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT FOUND'}`
  );
} else {
  console.log('❌ iOS GoogleService-Info.plist NOT FOUND');
}

// Check 2: google-services.json exists (Android)
const androidConfigPath = path.join(
  __dirname,
  '../android/app/google-services.json'
);
if (fs.existsSync(androidConfigPath)) {
  console.log('✅ Android google-services.json found');
} else {
  console.log('⚠️  Android google-services.json NOT FOUND (ok if iOS only)');
}

// Check 3: Firebase packages in package.json
const packageJsonPath = path.join(__dirname, '../package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const deps = packageJson.dependencies || {};

  console.log('\n📦 Firebase Packages:');
  Object.keys(deps)
    .filter((key) => key.includes('firebase'))
    .forEach((pkg) => {
      console.log(`   ${pkg}: ${deps[pkg]}`);
    });
}

// Check 4: Podfile configuration
const podfilePath = path.join(__dirname, '../ios/Podfile');
if (fs.existsSync(podfilePath)) {
  const podfile = fs.readFileSync(podfilePath, 'utf8');
  console.log('\n🔧 Podfile Firebase Configuration:');

  const firebasePods = [
    'FirebaseCore',
    'FirebaseAuth',
    'FirebaseFirestore',
    'FirebaseFunctions',
    'FirebaseStorage',
    'RecaptchaInterop',
  ];

  firebasePods.forEach((pod) => {
    if (podfile.includes(pod)) {
      console.log(`   ✅ ${pod} configured`);
    } else {
      console.log(`   ❌ ${pod} NOT configured`);
    }
  });
}

// Check 5: AppDelegate.swift Firebase initialization
const appDelegatePath = path.join(
  __dirname,
  '../ios/SocialCircle/AppDelegate.swift'
);
if (fs.existsSync(appDelegatePath)) {
  const appDelegate = fs.readFileSync(appDelegatePath, 'utf8');
  console.log('\n📱 AppDelegate Configuration:');

  if (appDelegate.includes('import FirebaseCore')) {
    console.log('   ✅ FirebaseCore imported');
  } else {
    console.log('   ❌ FirebaseCore NOT imported');
  }

  if (appDelegate.includes('FirebaseApp.configure()')) {
    console.log('   ✅ Firebase configured in didFinishLaunchingWithOptions');
  } else {
    console.log(
      '   ❌ Firebase NOT configured in didFinishLaunchingWithOptions'
    );
  }
}

// Check 6: Firebase config file
const firebaseConfigPath = path.join(__dirname, '../src/firebase/config.js');
if (fs.existsSync(firebaseConfigPath)) {
  const config = fs.readFileSync(firebaseConfigPath, 'utf8');
  console.log('\n⚙️  Firebase JS Configuration:');

  if (config.includes('@react-native-firebase')) {
    console.log('   ✅ Using @react-native-firebase (native modules)');
  } else if (config.includes('firebase/app')) {
    console.log('   ⚠️  Using legacy Firebase SDK (may cause issues)');
  }

  if (config.includes('persistence: true')) {
    console.log('   ✅ Firestore persistence enabled');
  } else {
    console.log('   ⚠️  Firestore persistence NOT enabled');
  }
}

console.log('\n\n🎯 Recommended Actions:');
console.log('1. Verify Email/Password sign-in is enabled in Firebase Console');
console.log('2. Check if test user exists in Firebase Authentication');
console.log('3. Verify Firestore security rules allow authenticated access');
console.log('4. Ensure iOS bundle ID matches Firebase project');
console.log('5. Try running: cd ios && pod install && cd ..');
console.log('6. Clean rebuild: npm run ios\n');

console.log('🌐 Check Firebase Console:');
console.log(
  '   https://console.firebase.google.com/project/social-scene1/authentication/providers'
);
console.log(
  '   https://console.firebase.google.com/project/social-scene1/authentication/users\n'
);
