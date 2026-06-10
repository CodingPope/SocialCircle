// Writes a .env file from process.env for react-native-dotenv during EAS builds
// EAS injects secrets into process.env; this script materializes them into .env

const fs = require('fs');
const path = require('path');

const keys = [
  'GOOGLE_MAPS_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_IOS_CLIENT_ID',
  'GOOGLE_ANDROID_CLIENT_ID',
  'GOOGLE_EXPO_CLIENT_ID',
  'EAS_PROJECT_ID',
  'IOS_BUNDLE_ID',
  'USE_FIREBASE_EMULATORS',
];

const lines = [];
for (const k of keys) {
  if (process.env[k] != null) {
    // Escape any newlines or quotes
    const v = String(process.env[k]).replace(/\n/g, '\\n');
    lines.push(`${k}=${v}`);
  }
}
const out = lines.join('\n') + '\n';

const envPath = path.join(process.cwd(), '.env');
try {
  fs.writeFileSync(envPath, out, { encoding: 'utf8' });
  console.log('[env] wrote', envPath);
} catch (e) {
  console.error('[env] failed to write .env', e?.message || e);
  process.exit(1);
}
