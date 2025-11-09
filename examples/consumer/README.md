# Lex Consumer Example

This directory contains a minimal example application that uses the Lex package as a dependency.

## Purpose

- Demonstrates how to consume the Lex package in a real application
- Validates that the published package exports work correctly
- Used by `scripts/consumer-smoke-test.sh` for end-to-end testing

## Files

- `package.json` - Example app configuration with Lex as a dependency
- `index.mjs` - JavaScript ESM example (runs with plain Node.js)
- `index.ts` - TypeScript example (runs with tsx)

## Running

### From within this directory (after installing Lex):

```bash
# JavaScript version
npm install
npm start

# TypeScript version
npm run start:ts
```

### Expected Output

```
Lex Consumer Example (JavaScript ESM)
======================================

Step 1: Capturing a work session frame...
✓ Frame captured: <uuid>
  Summary: Added receipt generation to policy checker
  Modules: policy/check, shared/types

Step 2: Recalling frame by keyword...
✓ Found 1 matching frame(s)
  [feature/receipts] Added receipt generation to policy checker
  Next: Add unit tests for receipt format

Step 3: Validating...
✓ Module scope validated

========================================
RECEIPT_OK: All validations passed
========================================
```

The `RECEIPT_OK` token is checked by the smoke test to confirm success.

## Usage in Smoke Tests

The `consumer-smoke-test.sh` script:

1. Builds and packs the Lex package
2. Creates a temp directory
3. Copies this example into it
4. Installs the Lex tarball
5. Runs `npm start`
6. Asserts that output contains `RECEIPT_OK`

This validates the entire publish pipeline without actually publishing to npm.
