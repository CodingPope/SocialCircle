// Description: Test script to check event images - paste this into App.js temporarily
// Or run from a test file to check Firestore event data

import { db } from '../src/services/firebase/config';

export async function diagnoseEventImages() {
  console.log('🔍 Starting event image diagnosis...\n');

  try {
    const eventsSnapshot = await db
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

    eventsSnapshot.docs.forEach((doc) => {
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
            createdAt:
              data.createdAt?.toDate?.() || data.createdAt || 'Unknown',
            photoUrl: data.photoUrl || null, // Sometimes stored as photoUrl
            image: data.image || null, // Or just image
          });
        }
      } else {
        withoutImages++;
        if (samples.withoutImage.length < 5) {
          samples.withoutImage.push({
            id: doc.id,
            title: data.title || 'Untitled',
            ownerId: data.ownerId,
            createdAt:
              data.createdAt?.toDate?.() || data.createdAt || 'Unknown',
            // Check if image exists under different field names
            hasPhotoUrl: !!data.photoUrl,
            hasImage: !!data.image,
            allKeys: Object.keys(data).filter(
              (k) =>
                k.toLowerCase().includes('image') ||
                k.toLowerCase().includes('photo')
            ),
          });
        }
      }
    });

    console.log('📊 SUMMARY:');
    console.log(
      `   ✅ Events WITH imageUrl: ${withImages} (${(
        (withImages / (withImages + withoutImages)) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `   ❌ Events WITHOUT imageUrl: ${withoutImages} (${(
        (withoutImages / (withImages + withoutImages)) *
        100
      ).toFixed(1)}%)\n`
    );

    if (samples.withImage.length > 0) {
      console.log('📸 EVENTS WITH IMAGES:');
      samples.withImage.forEach((evt, i) => {
        console.log(`\n${i + 1}. "${evt.title}"`);
        console.log(`   ID: ${evt.id}`);
        console.log(`   Owner: ${evt.ownerId}`);
        console.log(
          `   Created: ${
            typeof evt.createdAt === 'object'
              ? evt.createdAt.toString()
              : evt.createdAt
          }`
        );
        console.log(`   imageUrl: ${evt.imageUrl?.substring(0, 100)}...`);
        if (evt.photoUrl)
          console.log(`   photoUrl: ${evt.photoUrl?.substring(0, 100)}...`);
        if (evt.image)
          console.log(`   image: ${evt.image?.substring(0, 100)}...`);
      });
      console.log('\n');
    }

    if (samples.withoutImage.length > 0) {
      console.log('❌ EVENTS WITHOUT imageUrl:');
      samples.withoutImage.forEach((evt, i) => {
        console.log(`\n${i + 1}. "${evt.title}"`);
        console.log(`   ID: ${evt.id}`);
        console.log(`   Owner: ${evt.ownerId}`);
        console.log(
          `   Created: ${
            typeof evt.createdAt === 'object'
              ? evt.createdAt.toString()
              : evt.createdAt
          }`
        );
        console.log(`   Has photoUrl? ${evt.hasPhotoUrl}`);
        console.log(`   Has image? ${evt.hasImage}`);
        console.log(
          `   Image-related fields: ${evt.allKeys.join(', ') || 'NONE'}`
        );
      });
      console.log('\n');
    }

    console.log('🏁 Diagnosis complete!\n');

    console.log('💡 RECOMMENDATIONS:');
    if (withoutImages > withImages) {
      console.log('   ⚠️  MOST EVENTS ARE MISSING IMAGES!');
      console.log(
        '   → Check if event creation flow is uploading images to Storage'
      );
      console.log('   → Verify CreateEventScreen is setting imageUrl field');
      console.log(
        '   → Check Firebase Storage console for event-images folder\n'
      );
    } else if (withoutImages > 0) {
      console.log(
        '   ℹ️  Some events missing images (normal if users skip upload)'
      );
      console.log('   → Event creation flow appears to be working\n');
    } else {
      console.log('   ✅ All sampled events have images!\n');
    }

    if (withImages > 0) {
      console.log('🧪 TO TEST IMAGE LOADING:');
      console.log('   1. Copy one of the imageUrl values above');
      console.log('   2. Paste it in your browser to verify it loads');
      console.log(
        '   3. Check if URL starts with https://firebasestorage.googleapis.com'
      );
      console.log('   4. Verify Storage rules allow public read access\n');
    }

    return {
      total: withImages + withoutImages,
      withImages,
      withoutImages,
      percentage: ((withImages / (withImages + withoutImages)) * 100).toFixed(
        1
      ),
      samples,
    };
  } catch (error) {
    console.error('❌ ERROR during diagnosis:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}

// Uncomment to run immediately when this file is imported
// diagnoseEventImages().then(result => {
//   console.log('Final result:', result);
// });
