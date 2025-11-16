#!/usr/bin/env node
/**
 * Remove console.log, console.debug, console.warn from production code
 * Keep console.error but make them silent (commented)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const SRC_DIR = path.join(__dirname, '..', 'src');

// Patterns to remove completely
const REMOVE_PATTERNS = [
  /console\.log\([^)]*\);?\s*/g,
  /console\.debug\([^)]*\);?\s*/g,
  /console\.info\([^)]*\);?\s*/g,
  /\/\/\s*console\.log\([^)]*\);?\s*/g, // Already commented logs
];

// Patterns to comment out (keep for debugging but silent in prod)
const COMMENT_PATTERNS = [
  /(\s*)(console\.warn\([^)]*\);?)/g,
  /(\s*)(console\.error\([^)]*\);?)/g,
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const original = content;

  // Remove logs/debugs completely
  REMOVE_PATTERNS.forEach((pattern) => {
    const newContent = content.replace(pattern, '');
    if (newContent !== content) {
      modified = true;
      content = newContent;
    }
  });

  // Comment out warns/errors (keep for future debugging)
  COMMENT_PATTERNS.forEach((pattern) => {
    const newContent = content.replace(pattern, (match, indent, statement) => {
      if (match.trim().startsWith('//')) return match; // Already commented
      return `${indent}// ${statement}`;
    });
    if (newContent !== content) {
      modified = true;
      content = newContent;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Cleaned: ${path.relative(SRC_DIR, filePath)}`);
    return 1;
  }
  return 0;
}

// Find all JS/TS files in src
const files = glob.sync('**/*.{js,jsx,ts,tsx}', {
  cwd: SRC_DIR,
  absolute: true,
  ignore: ['**/node_modules/**', '**/__tests__/**', '**/*.test.{js,ts}'],
});

console.log(`🧹 Cleaning console statements from ${files.length} files...\n`);

let modifiedCount = 0;
files.forEach((file) => {
  modifiedCount += processFile(file);
});

console.log(`\n✨ Done! Modified ${modifiedCount} files.`);
console.log('📝 console.log/debug/info removed completely');
console.log(
  '💬 console.warn/error commented out (can uncomment for debugging)\n'
);
