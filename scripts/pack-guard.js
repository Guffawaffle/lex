#!/usr/bin/env node
/**
 * Pack guard script - validates tarball structure
 * Ensures:
 * - No canon/ source directories in tarball
 * - Only expected directories and files are included
 */
import fs from 'fs';

// Validate pack.json exists and is readable
let packData;
try {
  const packContent = fs.readFileSync('pack.json', 'utf8');
  packData = JSON.parse(packContent);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error('❌ pack.json not found. Run "npm pack --json > pack.json" first.');
  } else if (err instanceof SyntaxError) {
    console.error('❌ pack.json contains invalid JSON:', err.message);
  } else {
    console.error('❌ Failed to read pack.json:', err.message);
  }
  process.exit(1);
}

// Validate expected structure
if (!Array.isArray(packData) || packData.length === 0) {
  console.error('❌ pack.json does not contain expected array structure');
  process.exit(1);
}

if (!packData[0].files || !Array.isArray(packData[0].files)) {
  console.error('❌ pack.json[0] does not contain expected "files" array');
  process.exit(1);
}

const files = packData[0].files.map(x => x?.path).filter(p => p != null);
const allowed = ['README.md', 'LICENSE', 'package.json', 'CHANGELOG.md'];

// Check for unexpected files
const bad = files.filter(p => {
  if (/^dist\//.test(p)) return false;
  if (/^prompts\//.test(p)) return false;
  if (/^schemas\//.test(p)) return false;
  if (/^examples\//.test(p)) return false;
  if (/^src\/policy\//.test(p)) return false;
  if (allowed.includes(p)) return false;
  return true;
});

if (bad.length) {
  console.error('❌ Unexpected files in tarball:', bad);
  process.exit(1);
}

// Verify no canon/ source directories in tarball
const canonFiles = files.filter(p => /^canon\//.test(p));
if (canonFiles.length) {
  console.error('❌ Canon source directories should not be in tarball:', canonFiles);
  process.exit(1);
}

console.log('✅ Pack guard passed: valid structure, no canon/ source');
console.log('');
console.log('Tarball summary:');
console.log('  Total files:', files.length);
console.log('  dist/ files:', files.filter(p => /^dist\//.test(p)).length);
console.log('  prompts/ files:', files.filter(p => /^prompts\//.test(p)).length);
console.log('  schemas/ files:', files.filter(p => /^schemas\//.test(p)).length);
console.log('  examples/ files:', files.filter(p => /^examples\//.test(p)).length);
console.log('  src/policy/ files:', files.filter(p => /^src\/policy\//.test(p)).length);
console.log('  metadata files:', files.filter(p => allowed.includes(p)).length);
