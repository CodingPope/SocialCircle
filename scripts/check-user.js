const admin = require('firebase-admin');
const path = require('path');

// Try to find service account
let serviceAccount;
try {
  const files = require('fs').readdirSync(path.join(__dirname, '../functions'));
  const saFile = files.find(
    (f) => f.includes('firebase-adminsdk') && f.endsWith('.json'),
  );
  if (saFile) {
    serviceAccount = require(path.join(__dirname, '../functions', saFile));
  }
} catch (e) {
  console.error('Could not find service account:', e.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const uid = process.argv[2] || '8v1fWk1MchU1XSuXabFoRvtRfHt1';
const db = admin.firestore();

db.collection('users')
  .doc(uid)
  .get()
  .then((doc) => {
    if (doc.exists) {
      const data = doc.data();
      console.log('User doc found for:', uid);
      console.log('  firstName:', data.firstName || '(empty)');
      console.log('  lastName:', data.lastName || '(empty)');
      console.log('  email:', data.email || '(empty)');
      console.log('  appleSub:', data.appleSub || '(empty)');
      console.log('  appleRelayEmail:', data.appleRelayEmail || '(empty)');
    } else {
      console.log('User doc does not exist for:', uid);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
