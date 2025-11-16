#!/usr/bin/env node
/**
 * Comment out ALL console statements for production
 * This is safer than deletion and allows easy debugging if needed
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC_DIR = path.join(__dirname, '..', 'src');

// Get all JS/TS files (exclude tests)
const files = execSync(
  `find ${SRC_DIR} -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \\) ! -path "*/node_modules/*" ! -path "*/__tests__/*" ! -name "*.test.*" ! -path "*/testAuth.js"`,
  { encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .filter(Boolean);

console.log(`🧹 Silencing console statements in ${files.length} files...\n`);

let modifiedCount = 0;

files.forEach((filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Comment out all console.* calls that start a line (preserving indentation)
  // This handles: console.log, console.warn, console.error, console.info, console.debug, console.group, console.groupEnd
  content = content.replace(/^(\s*)(console\.[a-zA-Z]+\()/gm, '$1// $2');

  // Also handle inline console in strings (skip those - they're in quotes)
  // The regex above only matches line-start console calls

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    modifiedCount++;
    const relPath = path.relative(process.cwd(), filePath);
    console.log(`✅ ${relPath}`);
  }
});

console.log(`\n✨ Done! Modified ${modifiedCount} files`);
console.log(
  `💬 All console statements commented out - app will be silent in production\n`
);
