// Description: Check event images in Firestore to diagnose missing images issue
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'social-scene1',
  });
}

const db = admin.firestore();

async function checkEventImages() {
  console.log('🔍 Checking event images in Firestore...\n');

  try {
    // Get recent events
    const eventsSnapshot = await db
      .collection('events')
      .where('isDeleted', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    console.log(`📊 Found ${eventsSnapshot.size} recent active events\n`);

    let withImages = 0;
    let withoutImages = 0;
    const samplesWithImages = [];
    const samplesWithoutImages = [];

    eventsSnapshot.forEach((doc) => {
      const data = doc.data();
      const hasImageUrl = !!data.imageUrl;

      if (hasImageUrl) {
        withImages++;
        if (samplesWithImages.length < 5) {
          samplesWithImages.push({
            id: doc.id,
            title: data.title || 'Untitled',
            imageUrl: data.imageUrl,
            ownerId: data.ownerId,
            createdAt: data.createdAt?.toDate?.() || 'Unknown',
          });
        }
      } else {
        withoutImages++;
        if (samplesWithoutImages.length < 5) {
          // Check alternative field names
          const hasPhotoUrl = !!data.photoUrl;
          const hasImage = !!data.image;
          const hasPhoto = !!data.photo;

          samplesWithoutImages.push({
            id: doc.id,
            title: data.title || 'Untitled',
            ownerId: data.ownerId,
            createdAt: data.createdAt?.toDate?.() || 'Unknown',
            alternatives: {
              photoUrl: hasPhotoUrl ? data.photoUrl : null,
              image: hasImage ? data.image : null,
              photo: hasPhoto ? data.photo : null,
            },
          });
        }
      }
    });

    const total = withImages + withoutImages;
    const percentage = total > 0 ? ((withImages / total) * 100).toFixed(1) : 0;

    console.log('📊 SUMMARY:');
    console.log(`   ✅ Events WITH imageUrl: ${withImages} (${percentage}%)`);
    console.log(
      `   ❌ Events WITHOUT imageUrl: ${withoutImages} (${(
        100 - percentage
      ).toFixed(1)}%)\n`
    );

    if (samplesWithImages.length > 0) {
      console.log('📸 SAMPLE EVENTS WITH IMAGES:');
      samplesWithImages.forEach((evt, i) => {
        console.log(`\n${i + 1}. "${evt.title}"`);
        console.log(`   ID: ${evt.id}`);
        console.log(`   Owner: ${evt.ownerId}`);
        console.log(`   Created: ${evt.createdAt}`);
        console.log(`   Image URL: ${evt.imageUrl}`);
      });
      console.log('\n');
    }

    if (samplesWithoutImages.length > 0) {
      console.log('❌ SAMPLE EVENTS WITHOUT imageUrl:');
      samplesWithoutImages.forEach((evt, i) => {
        console.log(`\n${i + 1}. "${evt.title}"`);
        console.log(`   ID: ${evt.id}`);
        console.log(`   Owner: ${evt.ownerId}`);
        console.log(`   Created: ${evt.createdAt}`);

        const alts = [];
        if (evt.alternatives.photoUrl)
          alts.push(
            `photoUrl: ${evt.alternatives.photoUrl.substring(0, 50)}...`
          );
        if (evt.alternatives.image)
          alts.push(`image: ${evt.alternatives.image}`);
        if (evt.alternatives.photo)
          alts.push(`photo: ${evt.alternatives.photo}`);

        if (alts.length > 0) {
          console.log(`   Alternative fields found: ${alts.join(', ')}`);
        } else {
          console.log(`   ⚠️  NO image fields found at all!`);
        }
      });
      console.log('\n');
    }

    console.log('🏁 DIAGNOSIS COMPLETE!\n');

    console.log('💡 NEXT STEPS:');
    if (withImages === 0) {
      console.log('   ❌ NO EVENTS HAVE IMAGES!');
      console.log('   → Check event creation flow - images not being uploaded');
      console.log(
        '   → Verify CreateEventScreen uploads to Storage and saves imageUrl'
      );
      console.log(
        '   → Check Firebase Storage console for event-images folder\n'
      );
    } else if (withoutImages > withImages) {
      console.log('   ⚠️  MAJORITY of events missing images');
      console.log(
        '   → Some users are skipping image upload, or upload is failing'
      );
      console.log('   → Check error logs in event creation flow\n');
    } else {
      console.log('   ✅ Most events have images - this is normal!');
      console.log('   → Users can optionally skip image upload\n');
    }

    if (samplesWithImages.length > 0) {
      console.log('🧪 TEST IMAGE LOADING:');
      console.log('   1. Copy an imageUrl from above');
      console.log('   2. Paste it in your browser to verify it loads');
      console.log('   3. If it fails to load, check Storage rules\n');
    }

    return {
      total,
      withImages,
      withoutImages,
      percentage: parseFloat(percentage),
    };
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
    return null;
  }
}

// Run the check
checkEventImages()
  .then((result) => {
    if (result) {
      console.log(
        `\n📈 Final stats: ${result.withImages}/${result.total} events have images (${result.percentage}%)`
      );
    }
    process.exit(result ? 0 : 1);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
