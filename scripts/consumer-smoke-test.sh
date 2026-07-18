#!/usr/bin/env bash
set -euo pipefail

# Consumer smoke test for @smartergpt/lex.
# Tests that the built tarball can be installed and imported through declared
# package.json exports only.

echo "==> Consumer Smoke Test Starting"
echo ""

cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)

echo "==> Step 1: Building package"
npm run build

echo "==> Step 2: Creating tarball"
TARBALL=$(npm pack --silent | tail -n 1)
echo "Created: $TARBALL"
echo ""

TEST_DIR=$(mktemp -d)
echo "==> Step 3: Creating test consumer project in $TEST_DIR"

cd "$TEST_DIR"

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

echo "==> Step 5: Creating test files (TypeScript with tsx)"
npm install tsx --no-audit --no-fund > /dev/null 2>&1

VALIDATED_PATHS=()

cat > test-main.mts << 'EOF'
import { getDb, saveFrame, searchFrames, RUNTIME_SCOPE_CONTRACT_VERSION } from '@smartergpt/lex';

console.log('✅ Main entry (@smartergpt/lex): Core functions imported successfully');
console.log('   getDb type:', typeof getDb);
console.log('   saveFrame type:', typeof saveFrame);
console.log('   searchFrames type:', typeof searchFrames);

if (
  typeof getDb !== 'function' ||
  typeof saveFrame !== 'function' ||
  typeof searchFrames !== 'function' ||
  RUNTIME_SCOPE_CONTRACT_VERSION !== 1
) {
  console.error('❌ One or more core functions are not functions');
  process.exit(1);
}
EOF

cat > test-cli.mts << 'EOF'
import { createProgram, run } from '@smartergpt/lex/cli';

console.log('✅ CLI subpath (@smartergpt/lex/cli): Functions imported successfully');
console.log('   createProgram type:', typeof createProgram);
console.log('   run type:', typeof run);

if (typeof createProgram !== 'function' || typeof run !== 'function') {
  console.error('❌ CLI functions are not functions');
  process.exit(1);
}
EOF

cat > test-policy.mts << 'EOF'
import { loadPolicy, clearPolicyCache } from '@smartergpt/lex/policy';

console.log('✅ Policy subpath (@smartergpt/lex/policy): Functions imported successfully');
console.log('   loadPolicy type:', typeof loadPolicy);
console.log('   clearPolicyCache type:', typeof clearPolicyCache);

if (typeof loadPolicy !== 'function' || typeof clearPolicyCache !== 'function') {
  console.error('❌ Policy functions are not functions');
  process.exit(1);
}
EOF

cat > test-atlas.mts << 'EOF'
import { generateAtlasFrame, parseCodeUnit } from '@smartergpt/lex/atlas';

console.log('✅ Atlas subpath (@smartergpt/lex/atlas): Functions imported successfully');
console.log('   generateAtlasFrame type:', typeof generateAtlasFrame);
console.log('   parseCodeUnit type:', typeof parseCodeUnit);

if (typeof generateAtlasFrame !== 'function' || typeof parseCodeUnit !== 'function') {
  console.error('❌ Atlas functions are not functions');
  process.exit(1);
}
EOF

cat > test-store.mts << 'EOF'
import { getDb, saveFrame, searchFrames } from '@smartergpt/lex/store';

console.log('✅ Store subpath (@smartergpt/lex/store): Functions imported successfully');
console.log('   getDb type:', typeof getDb);
console.log('   saveFrame type:', typeof saveFrame);
console.log('   searchFrames type:', typeof searchFrames);

if (
  typeof getDb !== 'function' ||
  typeof saveFrame !== 'function' ||
  typeof searchFrames !== 'function'
) {
  console.error('❌ One or more store functions are not functions');
  process.exit(1);
}
EOF

cat > test-aliases.mts << 'EOF'
import { resolveModuleId, clearAliasTableCache } from '@smartergpt/lex/aliases';

console.log('✅ Aliases subpath (@smartergpt/lex/aliases): Functions imported successfully');
console.log('   resolveModuleId type:', typeof resolveModuleId);
console.log('   clearAliasTableCache type:', typeof clearAliasTableCache);

if (typeof resolveModuleId !== 'function' || typeof clearAliasTableCache !== 'function') {
  console.error('❌ Alias functions are not functions');
  process.exit(1);
}
EOF

cat > test-memory-validation.mts << 'EOF'
import { validateFramePayload } from '@smartergpt/lex/memory';

console.log('✅ Memory validation subpath (@smartergpt/lex/memory): Function imported successfully');
console.log('   validateFramePayload type:', typeof validateFramePayload);

if (typeof validateFramePayload !== 'function') {
  console.error('❌ validateFramePayload is not a function');
  process.exit(1);
}
EOF

cat > test-runtime-scope.mts << 'EOF'
import {
  RUNTIME_SCOPE_CONTRACT_VERSION,
  RUNTIME_SCOPE_CONFORMANCE_FIXTURES,
  WORKSPACE_AUTHORITY_ERROR_CODES,
} from '@smartergpt/lex/runtime-scope';

console.log('✅ Runtime scope subpath (@smartergpt/lex/runtime-scope): Contracts imported successfully');

if (
  RUNTIME_SCOPE_CONTRACT_VERSION !== 1 ||
  RUNTIME_SCOPE_CONFORMANCE_FIXTURES.length < 12 ||
  WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_UNBOUND !== 'LEX_WORKSPACE_UNBOUND'
) {
  console.error('❌ Runtime scope contract exports are incomplete');
  process.exit(1);
}
EOF

cat > test-negative.mts << 'EOF'
try {
  // @ts-expect-error - Testing that non-exported paths cannot be imported.
  await import('@smartergpt/lex/internal/non-exported.js');
  console.error('❌ SECURITY ISSUE: Non-exported path was accessible!');
  process.exit(1);
} catch (error) {
  console.log('✅ Negative test (non-exported path): Correctly blocked access');
  console.log('   Error type:', error instanceof Error ? error.name : typeof error);
}
EOF

echo "==> Step 6: Running import tests with tsx"
echo ""

echo "--- Test 1: Main entry point (@smartergpt/lex) ---"
if npx tsx test-main.mts; then
  VALIDATED_PATHS+=("@smartergpt/lex (main entry)")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 2: CLI subpath (@smartergpt/lex/cli) ---"
if npx tsx test-cli.mts; then
  VALIDATED_PATHS+=("@smartergpt/lex/cli")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 3: Policy subpath (@smartergpt/lex/policy) ---"
if npx tsx test-policy.mts; then
  VALIDATED_PATHS+=("@smartergpt/lex/policy")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 4: Atlas subpath (@smartergpt/lex/atlas) ---"
if npx tsx test-atlas.mts; then
  VALIDATED_PATHS+=("@smartergpt/lex/atlas")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 5: Store subpath (@smartergpt/lex/store) ---"
if npx tsx test-store.mts; then
  VALIDATED_PATHS+=("@smartergpt/lex/store")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 6: Aliases subpath (@smartergpt/lex/aliases) ---"
if npx tsx test-aliases.mts; then
  VALIDATED_PATHS+=("@smartergpt/lex/aliases")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 7: Memory validation subpath (@smartergpt/lex/memory) ---"
if npx tsx test-memory-validation.mts; then
  VALIDATED_PATHS+=("@smartergpt/lex/memory")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 8: Runtime scope subpath (@smartergpt/lex/runtime-scope) ---"
if npx tsx test-runtime-scope.mts; then
  VALIDATED_PATHS+=("@smartergpt/lex/runtime-scope")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 9: Negative test (non-exported path) ---"
if npx tsx test-negative.mts; then
  VALIDATED_PATHS+=("Non-exported paths (boundary enforcement)")
else
  echo "❌ Test failed"
  exit 1
fi
echo ""

echo "--- Test 10: Consumer example (examples/consumer) ---"
cp -r "$REPO_ROOT/examples/consumer" ./consumer-example
cd consumer-example

npm install "$REPO_ROOT/$TARBALL" --no-audit --no-fund

if EXAMPLE_OUTPUT=$(npm start 2>&1); then
  echo "$EXAMPLE_OUTPUT"

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

cd "$REPO_ROOT"
echo ""

echo "==> Step 7: Cleaning up"
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
