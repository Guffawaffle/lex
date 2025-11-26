/**
 * Global Test Setup
 *
 * Import this file at the top of any test to automatically get safe defaults.
 * This is the "just make it work" option - sets LEX_GIT_MODE=off immediately.
 *
 * Usage:
 * ```ts
 * import '../helpers/setup.js'; // Sets safe defaults
 * import { describe, it } from 'node:test';
 * ```
 *
 * For more control, use test-env.ts with beforeEach/afterEach hooks.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Find repo root (where package.json lives)
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

// Set safe defaults immediately on import
if (!process.env.LEX_GIT_MODE) {
  process.env.LEX_GIT_MODE = "off";
}

if (!process.env.LEX_DEFAULT_BRANCH) {
  process.env.LEX_DEFAULT_BRANCH = "test-branch";
}

if (!process.env.LEX_DEFAULT_COMMIT) {
  process.env.LEX_DEFAULT_COMMIT = "abc1234";
}

if (!process.env.LEX_LOG_LEVEL) {
  process.env.LEX_LOG_LEVEL = "silent";
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

if (!process.env.LEX_WORKSPACE_ROOT) {
  process.env.LEX_WORKSPACE_ROOT = repoRoot;
}
