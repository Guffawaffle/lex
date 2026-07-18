#!/usr/bin/env bash
set -euo pipefail

# Build and install the exact tarball a consumer would receive. Runtime imports
# and TypeScript resolution are checked through package.json exports only.

cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)
TEST_DIR=$(mktemp -d)
TARBALL=""

cleanup() {
  rm -rf "$TEST_DIR"
  if [[ -n "$TARBALL" ]]; then
    rm -f "$REPO_ROOT/$TARBALL"
  fi
}
trap cleanup EXIT

echo "==> Building and checking the source package"
npm run build
npm run check:public-api

echo "==> Packing the candidate artifact"
TARBALL=$(npm pack --ignore-scripts --silent | tail -n 1)

echo "==> Installing the tarball into a clean consumer"
cd "$TEST_DIR"
npm init --yes >/dev/null
npm pkg set type=module private=true >/dev/null
npm install "$REPO_ROOT/$TARBALL" --no-audit --no-fund

echo "==> Executing the installed CLI artifact"
EXPECTED_VERSION=$(node -p 'require("./node_modules/@smartergpt/lex/package.json").version')
CLI_VERSION=$(./node_modules/.bin/lex --version)
if [[ "$CLI_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "❌ Installed CLI version mismatch: expected $EXPECTED_VERSION, got $CLI_VERSION"
  exit 1
fi

cp "$REPO_ROOT/scripts/public-api-contract.mjs" .
cp "$REPO_ROOT/scripts/verify-public-api.mjs" .

echo "==> Validating all declared runtime exports"
node verify-public-api.mjs \
  --package-root "$TEST_DIR/node_modules/@smartergpt/lex" \
  --skip-docs \
  --write-consumer-types "$TEST_DIR/public-api-consumer.ts"

echo "==> Type-checking all declared exports from the packed package"
"$REPO_ROOT/node_modules/.bin/tsc" \
  --noEmit \
  --module NodeNext \
  --moduleResolution NodeNext \
  --target ES2022 \
  --resolveJsonModule \
  --strict \
  public-api-consumer.ts

echo "==> Running the published consumer example"
cp -r "$REPO_ROOT/examples/consumer" ./consumer-example
cd consumer-example
npm install "$REPO_ROOT/$TARBALL" --no-audit --no-fund
EXAMPLE_OUTPUT=$(npm start 2>&1)
echo "$EXAMPLE_OUTPUT"

if ! grep -q "RECEIPT_OK" <<<"$EXAMPLE_OUTPUT"; then
  echo "❌ Consumer example did not emit RECEIPT_OK"
  exit 1
fi

echo "==> ✅ Packed consumer smoke test passed"
echo "    declared runtime export paths imported"
echo "    declaration entry points type-checked"
echo "    undeclared internal paths remained blocked"
echo "    installed CLI executed and reported the packed version"
echo "    consumer example emitted RECEIPT_OK"
