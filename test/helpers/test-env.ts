/**
 * Test Environment Setup
 *
 * Provides base test utilities that ensure safe defaults for all tests.
 * Import this at the top of every test file to get consistent environment setup.
 *
 * CRITICAL: This module sets LEX_GIT_MODE=off by default to prevent:
 * - WSL2 TTY/GPG hangs from spawned git processes
 * - Tests accidentally depending on the runner's git state
 * - CI failures from missing git configuration
 *
 * Usage:
 * ```ts
 * import { setupTestEnv, cleanupTestEnv } from '../helpers/test-env.js';
 * import { describe, it, beforeEach, afterEach } from 'node:test';
 *
 * describe('My Test Suite', () => {
 *   beforeEach(() => setupTestEnv());
 *   afterEach(() => cleanupTestEnv());
 *
 *   it('works', () => { ... });
 * });
 * ```
 *
 * Or use the convenience wrapper:
 * ```ts
 * import { withTestEnv } from '../helpers/test-env.js';
 *
 * withTestEnv('My Test Suite', () => {
 *   it('works', () => { ... });
 * });
 * ```
 */

import { describe, beforeEach, afterEach } from "node:test";

/**
 * Environment variables that we manage during tests
 */
interface SavedEnv {
  LEX_GIT_MODE?: string;
  LEX_DEFAULT_BRANCH?: string;
  LEX_DEFAULT_COMMIT?: string;
  LEX_LOG_LEVEL?: string;
  LEX_WORKSPACE_ROOT?: string;
  NODE_ENV?: string;
}

/**
 * Saved environment state for restoration
 */
let savedEnv: SavedEnv | null = null;

/**
 * Default test environment values
 */
const TEST_DEFAULTS: SavedEnv = {
  LEX_GIT_MODE: "off",
  LEX_DEFAULT_BRANCH: "test-branch",
  LEX_DEFAULT_COMMIT: "abc1234",
  LEX_LOG_LEVEL: "silent",
  NODE_ENV: "test",
};

/**
 * Set up safe test environment defaults
 *
 * Call this in beforeEach() to ensure consistent test environment.
 * Saves current env vars for restoration in cleanupTestEnv().
 *
 * @param overrides - Optional overrides for specific env vars
 */
export function setupTestEnv(overrides: Partial<SavedEnv> = {}): void {
  // Save current environment
  savedEnv = {
    LEX_GIT_MODE: process.env.LEX_GIT_MODE,
    LEX_DEFAULT_BRANCH: process.env.LEX_DEFAULT_BRANCH,
    LEX_DEFAULT_COMMIT: process.env.LEX_DEFAULT_COMMIT,
    LEX_LOG_LEVEL: process.env.LEX_LOG_LEVEL,
    LEX_WORKSPACE_ROOT: process.env.LEX_WORKSPACE_ROOT,
    NODE_ENV: process.env.NODE_ENV,
  };

  // Apply defaults + overrides
  const env = { ...TEST_DEFAULTS, ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Restore environment to pre-test state
 *
 * Call this in afterEach() to clean up after tests.
 */
export function cleanupTestEnv(): void {
  if (!savedEnv) return;

  // Restore or delete each saved env var
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  savedEnv = null;
}

/**
 * Convenience wrapper that sets up and tears down test environment
 *
 * Use this instead of describe() to automatically get safe defaults.
 *
 * @param name - Test suite name
 * @param fn - Test suite function
 * @param overrides - Optional env var overrides
 */
export function withTestEnv(name: string, fn: () => void, overrides: Partial<SavedEnv> = {}): void {
  describe(name, () => {
    beforeEach(() => setupTestEnv(overrides));
    afterEach(() => cleanupTestEnv());
    fn();
  });
}

/**
 * Setup for tests that NEED git access (use sparingly!)
 *
 * Sets LEX_GIT_MODE=live. Only use this for tests that specifically
 * test git functionality and should be quarantined to test:git.
 */
export function setupGitTestEnv(): void {
  setupTestEnv({
    LEX_GIT_MODE: "live",
    LEX_DEFAULT_BRANCH: undefined, // Let it detect
    LEX_DEFAULT_COMMIT: undefined, // Let it detect
  });
}

/**
 * Convenience wrapper for git-enabled test suites
 *
 * These tests will be skipped unless LEX_GIT_MODE=live is explicitly set.
 * Use for tests that must interact with real git operations.
 */
export function withGitTestEnv(name: string, fn: () => void): void {
  const shouldRun = process.env.LEX_GIT_MODE === "live";

  if (!shouldRun) {
    describe.skip(`${name} (requires LEX_GIT_MODE=live)`, fn);
    return;
  }

  describe(name, () => {
    beforeEach(() => setupGitTestEnv());
    afterEach(() => cleanupTestEnv());
    fn();
  });
}

// Also export commonly needed test utilities
export { describe, it, beforeEach, afterEach } from "node:test";
export { default as assert } from "node:assert/strict";
