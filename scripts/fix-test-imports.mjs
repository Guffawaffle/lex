#!/usr/bin/env node
/**
 * Fix import paths in test files after moving from src/ to test/
 *
 * This script updates relative imports to point to src/ instead of within test/
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { dirname, relative, join } from 'path';

const testFiles = glob.sync('test/**/*.{test.ts,test.mjs,spec.mjs}');

for (const testFile of testFiles) {
  console.log(`Processing ${testFile}...`);

  let content = readFileSync(testFile, 'utf-8');
  const testDir = dirname(testFile);

  // Calculate relative path from test file to src/
  // e.g., test/memory/integration.test.ts -> ../../src
  const relativeToSrc = relative(testDir, 'src');

  // Don't modify imports that already point to dist/ or node_modules
  // Only fix relative imports within the same module structure

  // Pattern 1: import from "./something" or "../something"
  // These should become imports from src
  const lines = content.split('\n');
  const updatedLines = lines.map(line => {
    // Match import statements with relative paths
    const importMatch = line.match(/^(\s*import\s+.*from\s+['"])(\.\/)([^'"]+)(['"])/);
    if (importMatch) {
      const [, prefix, , path, suffix] = importMatch;
      // Replace ./ with ../../src/memory/ (or appropriate path)
      const testSubpath = testFile.replace('test/', '').replace(/\/[^/]+$/, '');
      return `${prefix}../../src/${testSubpath}/${path}${suffix}`;
    }

    const parentImportMatch = line.match(/^(\s*import\s+.*from\s+['"])(\.\.\/)([^'"]+)(['"])/);
    if (parentImportMatch && !line.includes('dist/')) {
      const [, prefix, , path, suffix] = parentImportMatch;
      // For ../ imports, need to adjust based on current location
      // This is trickier, will need case-by-case basis
      return line; // Keep as-is for now
    }

    return line;
  });

  const updated = updatedLines.join('\n');
  if (updated !== content) {
    writeFileSync(testFile, updated);
    console.log(`  ✓ Updated ${testFile}`);
  }
}

console.log('Done!');
