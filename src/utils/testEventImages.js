// Description: Add this function to any screen (like ProfileScreen or MapScreen)
// to run a quick diagnostic of event images
//
// Usage:
// 1. Import this function
// 2. Add a button that calls testEventImages()
// 3. Check your console/logs for the output

import { db } from '../firebase/config';

export async function testEventImages() {
  console.log('🔍 Testing event images...\n');

  try {
    const eventsSnapshot = await db
      .collection('events')
      .where('isDeleted', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();

    console.log(`📊 Found ${eventsSnapshot.size} recent events\n`);

    let withImages = 0;
    let withoutImages = 0;
    const samples = [];

    eventsSnapshot.forEach((doc) => {
      const data = doc.data();
      const hasImageUrl = !!data.imageUrl;

      if (hasImageUrl) {
        withImages++;
        if (samples.length < 10) {
          samples.push({
            id: doc.id,
            title: data.title,
            hasImage: true,
            imageUrl: data.imageUrl,
            ownerId: data.ownerId,
          });
        }
      } else {
        withoutImages++;
        if (samples.length < 10) {
          samples.push({
            id: doc.id,
            title: data.title,
            hasImage: false,
            ownerId: data.ownerId,
          });
        }
      }
    });

    const total = withImages + withoutImages;
    const percentage = total > 0 ? ((withImages / total) * 100).toFixed(1) : 0;

    console.log('📊 RESULTS:');
    console.log(`✅ WITH images: ${withImages} (${percentage}%)`);
    console.log(
      `❌ WITHOUT images: ${withoutImages} (${(100 - percentage).toFixed(
        1
      )}%)\n`
    );

    console.log('📋 SAMPLE EVENTS:');
    samples.forEach((evt, i) => {
      console.log(`\n${i + 1}. "${evt.title}"`);
      console.log(`   Has image: ${evt.hasImage ? '✅ YES' : '❌ NO'}`);
      if (evt.hasImage) {
        console.log(`   URL: ${evt.imageUrl?.substring(0, 100)}...`);
      }
      console.log(`   Event ID: ${evt.id}`);
    });

    console.log('\n🏁 Test complete!\n');

    if (withImages === 0) {
      console.warn(
        '⚠️  NO EVENTS HAVE IMAGES! Event creation may not be uploading images.'
      );
    } else if (percentage < 50) {
      console.warn(`⚠️  Only ${percentage}% of events have images.`);
    } else {
      console.log(`✅ ${percentage}% of events have images - looks good!`);
    }

    return {
      total,
      withImages,
      withoutImages,
      percentage: parseFloat(percentage),
      samples,
    };
  } catch (error) {
    console.error('❌ Error testing event images:', error);
    throw error;
  }
}

// Alternative: Check a specific event by ID
export async function checkSpecificEvent(eventId) {
  console.log(`🔍 Checking event: ${eventId}\n`);

  try {
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      console.error('❌ Event not found!');
      return null;
    }

    const data = eventDoc.data();

    console.log('📄 Event data:');
    console.log(`   Title: ${data.title}`);
    console.log(`   Owner: ${data.ownerId}`);
    console.log(`   Has imageUrl: ${!!data.imageUrl ? '✅ YES' : '❌ NO'}`);

    if (data.imageUrl) {
      console.log(`   Image URL: ${data.imageUrl}`);
      console.log(
        '\n💡 Copy the URL above and paste in browser to test loading'
      );
    } else {
      console.log('   ⚠️  No imageUrl field found');

      // Check for alternative field names
      const imageFields = Object.keys(data).filter(
        (k) =>
          k.toLowerCase().includes('image') || k.toLowerCase().includes('photo')
      );

      if (imageFields.length > 0) {
        console.log(
          `   Found these image-related fields: ${imageFields.join(', ')}`
        );
        imageFields.forEach((field) => {
          console.log(`   ${field}: ${data[field]}`);
        });
      }
    }

    return data;
  } catch (error) {
    console.error('❌ Error checking event:', error);
    throw error;
  }
}
