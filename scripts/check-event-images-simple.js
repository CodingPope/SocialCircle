// Description: Simple diagnostic to check event images using existing Firebase config
// Run with: node scripts/check-event-images-simple.js

const firestore = require('@react-native-firebase/firestore').default;

async function checkEventImages() {
  console.log('🔍 Checking event images in Firestore...\n');

  try {
    const eventsSnapshot = await firestore()
      .collection('events')
      .where('isDeleted', '==', false)
      .limit(50)
      .get();

    console.log(`📊 Found ${eventsSnapshot.size} active events\n`);

    let withImages = 0;
    let withoutImages = 0;
    const samples = {
      withImage: [],
      withoutImage: [],
    };

    eventsSnapshot.forEach((doc) => {
      const data = doc.data();
      const hasImage = !!data.imageUrl;

      if (hasImage) {
        withImages++;
        if (samples.withImage.length < 5) {
          samples.withImage.push({
            id: doc.id,
            title: data.title || 'Untitled',
            imageUrl: data.imageUrl,
            ownerId: data.ownerId,
            createdAt: data.createdAt?.toDate?.() || 'Unknown',
          });
        }
      } else {
        withoutImages++;
        if (samples.withoutImage.length < 5) {
          samples.withoutImage.push({
            id: doc.id,
            title: data.title || 'Untitled',
            ownerId: data.ownerId,
            createdAt: data.createdAt?.toDate?.() || 'Unknown',
          });
        }
      }
    });

    console.log('📊 Summary:');
    console.log(
      `   ✅ Events WITH images: ${withImages} (${(
        (withImages / (withImages + withoutImages)) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `   ❌ Events WITHOUT images: ${withoutImages} (${(
        (withoutImages / (withImages + withoutImages)) *
        100
      ).toFixed(1)}%)\n`
    );

    if (samples.withImage.length > 0) {
      console.log('📸 Sample events WITH images:');
      samples.withImage.forEach((evt, i) => {
        console.log(`\n   ${i + 1}. "${evt.title}"`);
        console.log(`      ID: ${evt.id}`);
        console.log(`      Created: ${evt.createdAt}`);
        console.log(`      Owner: ${evt.ownerId}`);
        console.log(`      Image URL: ${evt.imageUrl.substring(0, 80)}...`);
      });
      console.log('\n');
    }

    if (samples.withoutImage.length > 0) {
      console.log('❌ Sample events WITHOUT images:');
      samples.withoutImage.forEach((evt, i) => {
        console.log(`\n   ${i + 1}. "${evt.title}"`);
        console.log(`      ID: ${evt.id}`);
        console.log(`      Created: ${evt.createdAt}`);
        console.log(`      Owner: ${evt.ownerId}`);
      });
      console.log('\n');
    }

    console.log('🏁 Diagnosis complete!');
    console.log('\n💡 Next steps:');
    if (withoutImages > 0) {
      console.log('   - Events without images need to have imageUrl uploaded');
      console.log(
        '   - Check if event creation flow is uploading images properly'
      );
    }
    if (withImages > 0) {
      console.log(
        '   - Copy one of the image URLs above and paste in browser to test'
      );
      console.log(
        '   - Check Firebase Storage console for event-images folder'
      );
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkEventImages();
