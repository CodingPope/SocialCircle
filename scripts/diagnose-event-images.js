// Description: Diagnostic script to check event images in Firestore
// Run with: node scripts/diagnose-event-images.js

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json'); // You'll need to add this

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function diagnoseEventImages() {
  console.log('🔍 Checking event images...\n');

  const eventsSnapshot = await db
    .collection('events')
    .where('isDeleted', '==', false)
    .limit(50)
    .get();

  console.log(`📊 Found ${eventsSnapshot.size} active events\n`);

  let withImages = 0;
  let withoutImages = 0;
  const sampleUrls = [];

  eventsSnapshot.forEach((doc) => {
    const data = doc.data();
    const hasImage = !!data.imageUrl;

    if (hasImage) {
      withImages++;
      if (sampleUrls.length < 3) {
        sampleUrls.push({
          eventId: doc.id,
          title: data.title,
          imageUrl: data.imageUrl,
        });
      }
    } else {
      withoutImages++;
    }
  });

  console.log(`✅ Events WITH images: ${withImages}`);
  console.log(`❌ Events WITHOUT images: ${withoutImages}\n`);

  if (sampleUrls.length > 0) {
    console.log('📸 Sample image URLs:');
    sampleUrls.forEach((sample, i) => {
      console.log(`\n${i + 1}. Event: ${sample.title}`);
      console.log(`   ID: ${sample.eventId}`);
      console.log(`   URL: ${sample.imageUrl}`);
    });
  }

  console.log('\n🏁 Diagnosis complete!');
  process.exit(0);
}

diagnoseEventImages().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
