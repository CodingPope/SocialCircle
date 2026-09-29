const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const targets = [
  path.join(
    projectRoot,
    'node_modules',
    '@expo',
    'cli',
    'node_modules',
    '@react-native',
    'dev-middleware',
    'dist',
    'inspector-proxy',
    'InspectorProxy.js'
  ),
  path.join(
    projectRoot,
    'node_modules',
    '@react-native',
    'dev-middleware',
    'dist',
    'inspector-proxy',
    'InspectorProxy.js'
  ),
];

const patchNeedle = '      perMessageDeflate: true,\n      maxPayload: 0,';
const patchReplacement = '      perMessageDeflate: true,\n      maxFragments: 0,\n      maxPayload: 0,';

const debugNeedle = '      perMessageDeflate: false,\n      maxPayload: 0,';
const debugReplacement = '      perMessageDeflate: false,\n      maxFragments: 0,\n      maxPayload: 0,';

let patchedAny = false;

for (const filePath of targets) {
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  let next = original;

  if (!next.includes('maxFragments: 0,')) {
    next = next.replace(patchNeedle, patchReplacement);
    next = next.replace(debugNeedle, debugReplacement);
  }

  if (next !== original) {
    fs.writeFileSync(filePath, next, 'utf8');
    patchedAny = true;
    console.log(`[fix-expo-ws-fragments] patched ${filePath}`);
  }
}

if (!patchedAny) {
  console.log('[fix-expo-ws-fragments] no changes needed');
}
