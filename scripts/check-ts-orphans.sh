#!/usr/bin/env bash
# Check for orphaned TypeScript files not covered by composite project references
# This catches TS6307 errors before they break the build

set -e

echo "Checking for orphaned TypeScript files..."

# Run tsc build in dry mode and capture stderr
BUILD_OUTPUT=$(tsc -b tsconfig.build.json 2>&1 || true)

# Check for TS6307 errors (file not listed within project)
if echo "$BUILD_OUTPUT" | grep -q "error TS6307"; then
  echo ""
  echo "❌ ERROR: Orphaned TypeScript files detected!"
  echo ""
  echo "The following files are not included in any tsconfig.json project:"
  echo "$BUILD_OUTPUT" | grep "error TS6307" | sed 's/.*error TS6307: /  /'
  echo ""
  echo "To fix: Add the file to the appropriate tsconfig.json include array"
  echo "See: .github/copilot-instructions.md → TypeScript Composite Projects"
  echo ""
  exit 1
fi

echo "✅ All TypeScript files are properly included in composite projects"
