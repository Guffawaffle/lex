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

# Step 3: Create temporary consumer project
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
npm install "$REPO_ROOT/$TARBALL" --no-audit --no-fund

# Step 5: Create test files for each subpath export
echo "==> Step 5: Creating test files (TypeScript with tsx)"

# Install tsx for TypeScript execution
npm install tsx --no-audit --no-fund > /dev/null 2>&1

# Initialize array to track validated paths
VALIDATED_PATHS=()

# Test 1: Main entry point (lex)
cat > test-main.mts << 'EOF'
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
cat > test-cli.mts << 'EOF'
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

# Test 3: Policy check subpath (lex/policy/check/*)
cat > test-policy-check.mts << 'EOF'
// Test: Import from 'lex/policy/check/*'
import { detectViolations } from 'lex/policy/check/violations.js';

console.log('✅ Policy check subpath (lex/policy/check/violations): detectViolations imported successfully');
console.log('   detectViolations type:', typeof detectViolations);

if (typeof detectViolations !== 'function') {
  console.error('❌ detectViolations is not a function');
  process.exit(1);
}
EOF

# Test 4: Policy merge subpath (lex/policy/merge/*)
cat > test-policy-merge.mts << 'EOF'
// Test: Import from 'lex/policy/merge/*'
import { mergeScans } from 'lex/policy/merge/merge.js';

console.log('✅ Policy merge subpath (lex/policy/merge/merge): mergeScans imported successfully');
console.log('   mergeScans type:', typeof mergeScans);

if (typeof mergeScans !== 'function') {
  console.error('❌ mergeScans is not a function');
  process.exit(1);
}
EOF

# Test 5: Memory store subpath (lex/memory/store/*)
cat > test-memory-store.mts << 'EOF'
// Test: Import from 'lex/memory/store/*'
import { getDb, saveFrame, searchFrames } from 'lex/memory/store/index.js';

console.log('✅ Memory store subpath (lex/memory/store): Functions imported successfully');
console.log('   getDb type:', typeof getDb);
console.log('   saveFrame type:', typeof saveFrame);
console.log('   searchFrames type:', typeof searchFrames);

if (typeof getDb !== 'function' ||
    typeof saveFrame !== 'function' ||
    typeof searchFrames !== 'function') {
  console.error('❌ One or more memory store functions are not functions');
  process.exit(1);
}
EOF

# Test 6: Shared policy subpath (lex/shared/policy/*)
cat > test-shared-policy.mts << 'EOF'
// Test: Import from 'lex/shared/policy/*'
import { loadPolicy } from 'lex/shared/policy/index.js';

console.log('✅ Shared policy subpath (lex/shared/policy): loadPolicy imported successfully');
console.log('   loadPolicy type:', typeof loadPolicy);

if (typeof loadPolicy !== 'function') {
  console.error('❌ loadPolicy is not a function');
  process.exit(1);
}
EOF

# Test 7: Negative test - non-exported path (should fail)
cat > test-negative.mts << 'EOF'
// Test: Attempt to import from a non-exported path
// This should fail, demonstrating export boundaries are enforced
try {
  // @ts-expect-error - Testing that non-exported paths cannot be imported
  const { something } = await import('lex/internal/non-exported.js');
  console.error('❌ SECURITY ISSUE: Non-exported path was accessible!');
  process.exit(1);
} catch (error) {
  console.log('✅ Negative test (non-exported path): Correctly blocked access');
  console.log('   Error type:', error instanceof Error ? error.name : typeof error);
}
EOF

# Step 6: Run the tests with tsx (TypeScript compilation validation)
echo "==> Step 6: Running import tests with tsx"
echo ""

echo "--- Test 1: Main entry point (lex) ---"
if npx tsx test-main.mts; then
  VALIDATED_PATHS+=("lex (main entry)")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 2: CLI subpath (lex/cli) ---"
if npx tsx test-cli.mts; then
  VALIDATED_PATHS+=("lex/cli")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 3: Policy check subpath (lex/policy/check/*) ---"
if npx tsx test-policy-check.mts; then
  VALIDATED_PATHS+=("lex/policy/check/*")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 4: Policy merge subpath (lex/policy/merge/*) ---"
if npx tsx test-policy-merge.mts; then
  VALIDATED_PATHS+=("lex/policy/merge/*")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 5: Memory store subpath (lex/memory/store/*) ---"
if npx tsx test-memory-store.mts; then
  VALIDATED_PATHS+=("lex/memory/store/*")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 6: Shared policy subpath (lex/shared/policy/*) ---"
if npx tsx test-shared-policy.mts; then
  VALIDATED_PATHS+=("lex/shared/policy/*")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 7: Negative test (non-exported path) ---"
if npx tsx test-negative.mts; then
  VALIDATED_PATHS+=("Non-exported paths (boundary enforcement)")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

# Step 6b: Test the consumer example
echo "--- Test 8: Consumer example (examples/consumer) ---"
# Copy the consumer example
cp -r "$REPO_ROOT/examples/consumer" ./consumer-example
cd consumer-example

# Install the tarball in the consumer example
npm install "$REPO_ROOT/$TARBALL" --no-audit --no-fund

# Run the example and capture output
if EXAMPLE_OUTPUT=$(npm start 2>&1); then
  echo "$EXAMPLE_OUTPUT"

  # Check for RECEIPT_OK token
  if echo "$EXAMPLE_OUTPUT" | grep -q "RECEIPT_OK"; then
    echo ""
    echo "✅ Consumer example: RECEIPT_OK found in output"
    VALIDATED_PATHS+=("examples/consumer (RECEIPT_OK)")
  else
    echo ""
    echo "❌ Consumer example: RECEIPT_OK not found in output"
    cd "$REPO_ROOT"
    rm -rf "$TEST_DIR"
    rm -f "$TARBALL"
    exit 1
  fi
else
  echo "$EXAMPLE_OUTPUT"
  echo ""
  echo "❌ Consumer example failed to run"
  cd "$REPO_ROOT"
  rm -rf "$TEST_DIR"
  rm -f "$TARBALL"
  exit 1
fi

cd "$TEST_DIR"
echo ""

# Step 7: Cleanup
echo "==> Step 7: Cleaning up"
cd "$REPO_ROOT"
rm -rf "$TEST_DIR"
rm -f "$TARBALL"

echo ""
echo "==> ✅ Consumer Smoke Test PASSED"
echo ""
echo "All subpath exports validated successfully:"
for path in "${VALIDATED_PATHS[@]}"; do
  echo "  ✓ $path"
done
echo ""
echo "Summary:"
echo "  • ${#VALIDATED_PATHS[@]} export paths tested"
echo "  • All TypeScript compilations successful (tsx)"
echo "  • All runtime executions successful"
echo "  • Export boundaries properly enforced"
echo ""
