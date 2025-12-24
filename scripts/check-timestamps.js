#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function walk(dir, filelist = []) {
  // Skip node_modules, build, and other non-source directories
  if (
    dir.includes('node_modules') ||
    dir.includes('/build/') ||
    dir.includes('/.') ||
    dir.includes('/Pods/')
  ) {
    return filelist;
  }

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      filelist = walk(filepath, filelist);
    } else if (
      (file.endsWith('.js') || file.endsWith('.ts')) &&
      !file.endsWith('.test.js')
    ) {
      filelist.push(filepath);
    }
  });
  return filelist;
}

const root = path.resolve(__dirname, '..');
const srcDirs = [path.join(root, 'src'), path.join(root, 'functions')];

const offenders = [];

srcDirs.forEach((srcDir) => {
  if (!fs.existsSync(srcDir)) return;

  const files = walk(srcDir);
  files.forEach((f) => {
    const content = fs.readFileSync(f, 'utf8');
    // Heuristic: new Date() used near Firestore write operations
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Skip commented lines
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;

      if (/new Date\(\)/.test(line)) {
        // Check if this line or surrounding lines contain Firestore writes
        const context = lines.slice(Math.max(0, idx - 2), idx + 3).join(' ');
        // Skip if it's display/formatting code
        if (
          /(toLocaleString|toISOString|getTime|getFullYear|getMonth)/.test(
            context
          )
        )
          return;

        if (
          /(\.update\(|\.set\(|setDoc\(|updateDoc\(|deletedAt:|createdAt:|updatedAt:)/.test(
            context
          )
        ) {
          offenders.push({ file: f, line: idx + 1, content: line.trim() });
        }
      }
    });
  });
});

if (offenders.length > 0) {
  console.error(
    '\n❌ Timestamp check failed. Found uses of new Date() in Firestore write contexts:\n'
  );
  offenders.forEach((o) => {
    console.error(`  ${o.file}:${o.line}`);
    console.error(`    ${o.content}\n`);
  });
  console.error(
    'Use serverTimestamp() instead of new Date() for Firestore writes.\n'
  );
  process.exitCode = 1;
} else {
  console.log(
    '✅ Timestamp check passed - no new Date() found in Firestore writes'
  );
}
