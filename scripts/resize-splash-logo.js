// Description: Resizes the splash screen logo to be smaller (30-40% of canvas)
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '../assets');
const SPLASH_ICON_PATH = path.join(ASSETS_DIR, 'splash-icon.png');
const BACKUP_PATH = path.join(ASSETS_DIR, 'splash-icon-backup.png');
const OUTPUT_PATH = path.join(ASSETS_DIR, 'splash-icon.png');

// Target canvas size (typical splash screen dimensions)
const CANVAS_WIDTH = 1284;
const CANVAS_HEIGHT = 2778;

// Logo will be this percentage of the canvas height
const LOGO_HEIGHT_PERCENT = 0.25; // 25% of height — typical medium launch logo size

async function resizeSplashLogo() {
  try {
    console.log('📸 Reading original splash icon...');

    // Determine source file (use backup if it exists, otherwise use current)
    const sourceFile = fs.existsSync(BACKUP_PATH)
      ? BACKUP_PATH
      : SPLASH_ICON_PATH;

    // Backup original only if backup doesn't exist
    if (!fs.existsSync(BACKUP_PATH) && sourceFile === SPLASH_ICON_PATH) {
      fs.copyFileSync(SPLASH_ICON_PATH, BACKUP_PATH);
      console.log('✅ Backup created at splash-icon-backup.png');
    } else if (fs.existsSync(BACKUP_PATH)) {
      console.log('ℹ️  Using existing backup as source');
    }

    // Get original image metadata
    const metadata = await sharp(sourceFile).metadata();
    console.log(`Original dimensions: ${metadata.width}x${metadata.height}`);

    // Calculate new logo height (preserve aspect ratio)
    const newLogoHeight = Math.floor(CANVAS_HEIGHT * LOGO_HEIGHT_PERCENT);
    const aspectRatio = metadata.width / metadata.height;
    const newLogoWidth = Math.floor(newLogoHeight * aspectRatio);

    console.log(`New logo dimensions: ${newLogoWidth}x${newLogoHeight}`);
    console.log(
      `Logo will be ${(LOGO_HEIGHT_PERCENT * 100).toFixed(0)}% of screen height`,
    );

    // Resize the logo
    const resizedLogoBuffer = await sharp(sourceFile)
      .resize(newLogoWidth, newLogoHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent
      })
      .toBuffer();

    // Create new canvas with logo centered
    await sharp({
      create: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        channels: 4,
        background: { r: 26, g: 29, b: 46, alpha: 0 }, // Transparent (background color set in app.json)
      },
    })
      .composite([
        {
          input: resizedLogoBuffer,
          gravity: 'center',
        },
      ])
      .png()
      .toFile(OUTPUT_PATH);

    console.log('✅ Splash icon resized successfully!');
    console.log(`📁 Output: ${OUTPUT_PATH}`);
    console.log(
      '\n💡 To adjust size, change LOGO_HEIGHT_PERCENT in this script (currently 15%)',
    );
    console.log('   - 0.12 = 12% (tiny, very subtle)');
    console.log('   - 0.15 = 15% (small, recommended)');
    console.log('   - 0.20 = 20% (medium-small)');
    console.log('   - 0.25 = 25% (medium)');
    console.log(
      '\n🔄 IMPORTANT: Delete the app from device and rebuild to see changes!',
    );
    console.log('   The splash screen is cached in the native build.');
    console.log('   Run: npm run ios (and delete app from simulator first)');
  } catch (error) {
    console.error('❌ Error resizing splash icon:', error.message);

    if (error.message.includes('sharp')) {
      console.log('\n📦 Sharp not installed. Installing now...');
      console.log('Run: npm install --save-dev sharp');
    }
  }
}

resizeSplashLogo();
