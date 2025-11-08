#!/usr/bin/env bash
set -euo pipefail

# Consumer smoke test for lex package
# Tests that the built tarball can be installed and imported correctly

echo "==> Consumer Smoke Test Starting"
echo ""

# Ensure we're in the repo root
cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)

# Step 1: Build and pack
echo "==> Step 1: Building package"
npm run build

echo "==> Step 2: Creating tarball"
npm pack
TARBALL=$(ls -t lex-*.tgz | head -1)
echo "Created: $TARBALL"
echo ""

# Step 2: Create temporary consumer project
TEST_DIR=$(mktemp -d)
echo "==> Step 3: Creating test consumer project in $TEST_DIR"

cd "$TEST_DIR"

# Initialize a minimal package.json
cat > package.json << 'EOF'
{
  "name": "lex-consumer-test",
  "version": "1.0.0",
  "type": "module",
  "private": true
}
EOF

echo "==> Step 4: Installing tarball"
npm install "$REPO_ROOT/$TARBALL" --no-save --no-audit --no-fund

# Step 3: Create test files for each subpath export
echo "==> Step 5: Creating test files"

# Test 1: Main entry point (lex)
cat > test-main.mjs << 'EOF'
// Test: Import from main entry point 'lex'
import { getDb, saveFrame, searchFrames } from 'lex';

console.log('✅ Main entry (lex): Core functions imported successfully');
console.log('   getDb type:', typeof getDb);
console.log('   saveFrame type:', typeof saveFrame);
console.log('   searchFrames type:', typeof searchFrames);

if (typeof getDb !== 'function' || 
    typeof saveFrame !== 'function' || 
    typeof searchFrames !== 'function') {
  console.error('❌ One or more core functions are not functions');
  process.exit(1);
}
EOF

# Test 2: CLI subpath (lex/cli)
cat > test-cli.mjs << 'EOF'
// Test: Import from 'lex/cli'
import { createProgram, run } from 'lex/cli';

console.log('✅ CLI subpath (lex/cli): Functions imported successfully');
console.log('   createProgram type:', typeof createProgram);
console.log('   run type:', typeof run);

if (typeof createProgram !== 'function' || typeof run !== 'function') {
  console.error('❌ CLI functions are not functions');
  process.exit(1);
}
EOF

# Test 3: Policy subpath (lex/policy/*)
cat > test-policy.mjs << 'EOF'
// Test: Import from 'lex/policy/*'
import { detectViolations } from 'lex/policy/check/violations.js';
import { mergeScans } from 'lex/policy/merge/merge.js';
import { resolveFileToModule } from 'lex/policy/scanners/common.js';

console.log('✅ Policy subpath (lex/policy/check): detectViolations imported successfully');
console.log('   detectViolations type:', typeof detectViolations);

console.log('✅ Policy subpath (lex/policy/merge): mergeScans imported successfully');
console.log('   mergeScans type:', typeof mergeScans);

console.log('✅ Policy subpath (lex/policy/scanners): resolveFileToModule imported successfully');
console.log('   resolveFileToModule type:', typeof resolveFileToModule);

if (typeof detectViolations !== 'function' || 
    typeof mergeScans !== 'function' || 
    typeof resolveFileToModule !== 'function') {
  console.error('❌ One or more policy functions are not functions');
  process.exit(1);
}
EOF

# Step 4: Run the tests
echo "==> Step 6: Running import tests"
echo ""

echo "--- Test 1: Main entry point (lex) ---"
node test-main.mjs
echo ""

echo "--- Test 2: CLI subpath (lex/cli) ---"
node test-cli.mjs
echo ""

echo "--- Test 3: Policy subpath (lex/policy/*) ---"
node test-policy.mjs
echo ""

# Step 5: Cleanup
echo "==> Step 7: Cleaning up"
cd "$REPO_ROOT"
rm -rf "$TEST_DIR"
rm -f "$TARBALL"

echo ""
echo "==> ✅ Consumer Smoke Test PASSED"
echo ""
echo "All subpaths successfully tested:"
echo "  • lex (main entry)"
echo "  • lex/cli"
echo "  • lex/policy/*"
echo ""
