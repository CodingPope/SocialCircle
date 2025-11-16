#!/usr/bin/env node
/**
 * Remove/comment console statements for production
 * Handles multi-line statements properly
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC_DIR = path.join(__dirname, '..', 'src');

// Get all JS/TS files
const files = execSync(
  `find ${SRC_DIR} -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \\) ! -path "*/node_modules/*" ! -path "*/__tests__/*" ! -name "*.test.*"`,
  { encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .filter(Boolean);

console.log(`🧹 Processing ${files.length} files...\n`);

let modifiedCount = 0;

files.forEach((filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Remove console.log completely (including multi-line)
  content = content.replace(/console\.log\([^;]*\);?/gs, '');

  // Comment out console.warn (keep for debugging)
  content = content.replace(/^(\s*)console\.warn\(/gm, '$1// console.warn(');

  // Comment out console.error (keep for debugging)
  content = content.replace(/^(\s*)console\.error\(/gm, '$1// console.error(');

  // Comment out console.info
  content = content.replace(/^(\s*)console\.info\(/gm, '$1// console.info(');

  // Comment out console.debug
  content = content.replace(/^(\s*)console\.debug\(/gm, '$1// console.debug(');

  // Comment out console.group
  content = content.replace(/^(\s*)console\.group\(/gm, '$1// console.group(');
  content = content.replace(
    /^(\s*)console\.groupEnd\(/gm,
    '$1// console.groupEnd('
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    modifiedCount++;
    const relPath = path.relative(process.cwd(), filePath);
    console.log(`✅ ${relPath}`);
  }
});

console.log(`\n✨ Done! Modified ${modifiedCount} files`);
console.log('📝 Removed: console.log');
console.log(
  '💬 Commented: console.warn, console.error, console.info, console.debug\n'
);
