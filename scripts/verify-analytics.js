#!/usr/bin/env node
// Description: Verify analytics and location are production-ready
const fs = require('fs');
const path = require('path');

console.log('🔍 Social Circle Analytics Production Readiness Check\n');

const checks = [];

// Check 1: Info.plist doesn't globally disable analytics
const infoPlistPath = path.join(__dirname, '../ios/SocialCircle/Info.plist');
const infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
const hasGlobalDisable = infoPlist.includes(
  '<key>FIREBASE_ANALYTICS_COLLECTION_ENABLED</key>'
);
checks.push({
  name: 'Info.plist analytics not globally disabled',
  pass: !hasGlobalDisable,
  detail: hasGlobalDisable
    ? '❌ Found FIREBASE_ANALYTICS_COLLECTION_ENABLED key — remove it to allow dynamic control'
    : '✅ Analytics controlled dynamically via JS',
});

// Check 2: analytics.js includes location import
const analyticsPath = path.join(__dirname, '../src/services/analyticsService.js');
const analyticsCode = fs.readFileSync(analyticsPath, 'utf8');
const hasLocationImport = analyticsCode.includes("from './locationContext'");
checks.push({
  name: 'Location context integrated',
  pass: hasLocationImport,
  detail: hasLocationImport
    ? '✅ Location automatically added to events'
    : '❌ Missing locationContext import',
});

// Check 3: locationContext.js exists
const locationContextPath = path.join(
  __dirname,
  '../src/services/locationContextService.js'
);
const locationContextExists = fs.existsSync(locationContextPath);
checks.push({
  name: 'Location service exists',
  pass: locationContextExists,
  detail: locationContextExists
    ? '✅ locationContext.js found'
    : '❌ Missing locationContext.js',
});

// Check 4: GoogleService-Info.plist has correct bundle ID
const googlePlistPath = path.join(__dirname, '../GoogleService-Info.plist');
const googlePlist = fs.readFileSync(googlePlistPath, 'utf8');
const bundleIdMatch = googlePlist.match(
  /<key>BUNDLE_ID<\/key>\s*<string>(.+?)<\/string>/
);
const bundleId = bundleIdMatch ? bundleIdMatch[1] : 'UNKNOWN';
checks.push({
  name: 'Firebase bundle ID matches app',
  pass: bundleId === 'com.socialcirclellc.app',
  detail:
    bundleId === 'com.socialcirclellc.app'
      ? '✅ Bundle ID: com.socialcirclellc.app'
      : `❌ Bundle ID mismatch: ${bundleId}`,
});

// Check 5: Tests passing
const testResult = require('child_process').spawnSync(
  'npm',
  ['test', '--', 'analytics', '--passWithNoTests'],
  {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    encoding: 'utf8',
  }
);
const testsPass = testResult.status === 0;
checks.push({
  name: 'Analytics tests passing',
  pass: testsPass,
  detail: testsPass
    ? '✅ All analytics tests pass'
    : `❌ Tests failed:\n${testResult.stderr}`,
});

// Print results
console.log('📊 Check Results:\n');
checks.forEach((check) => {
  const icon = check.pass ? '✅' : '❌';
  console.log(`${icon} ${check.name}`);
  console.log(`   ${check.detail}\n`);
});

const allPass = checks.every((c) => c.pass);
console.log('━'.repeat(60));
if (allPass) {
  console.log('🎉 All checks passed! Analytics are production-ready.');
  console.log('\n📝 Next steps:');
  console.log('   1. Test in fresh simulator (clear data, accept opt-in)');
  console.log(
    '   2. Verify events in Firebase DebugView (with -FIRAnalyticsDebugEnabled)'
  );
  console.log('   3. Deploy TestFlight build and check Realtime map');
  console.log('   4. Update Privacy Policy to mention analytics collection\n');
} else {
  console.log(
    '⚠️  Some checks failed. Review details above and fix before production.\n'
  );
  process.exit(1);
}
