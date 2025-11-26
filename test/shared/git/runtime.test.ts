/**
 * Tests for git runtime mode control
 *
 * Tests cover:
 * - Default mode initialization
 * - Mode switching with setGitMode
 * - gitIsEnabled() boolean check
 * - Environment variable detection for branch and commit
 * - Mode persistence across multiple calls
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
  getGitMode,
  setGitMode,
  gitIsEnabled,
  getEnvBranch,
  getEnvCommit,
} from "@app/shared/git/runtime.js";

describe("Git Runtime Mode Control", () => {
  let originalGitMode: string | undefined;
  let originalDefaultBranch: string | undefined;
  let originalBranch: string | undefined;
  let originalDefaultCommit: string | undefined;
  let originalCommit: string | undefined;

  beforeEach(() => {
    // Save original environment
    originalGitMode = process.env.LEX_GIT_MODE;
    originalDefaultBranch = process.env.LEX_DEFAULT_BRANCH;
    originalBranch = process.env.LEX_BRANCH;
    originalDefaultCommit = process.env.LEX_DEFAULT_COMMIT;
    originalCommit = process.env.LEX_COMMIT;

    // Clean environment for test isolation
    delete process.env.LEX_GIT_MODE;
    delete process.env.LEX_DEFAULT_BRANCH;
    delete process.env.LEX_BRANCH;
    delete process.env.LEX_DEFAULT_COMMIT;
    delete process.env.LEX_COMMIT;

    // Reset to default mode
    setGitMode("off");
  });

  // Teardown helper
  function teardown() {
    // Restore original environment
    if (originalGitMode !== undefined) {
      process.env.LEX_GIT_MODE = originalGitMode;
    } else {
      delete process.env.LEX_GIT_MODE;
    }

    if (originalDefaultBranch !== undefined) {
      process.env.LEX_DEFAULT_BRANCH = originalDefaultBranch;
    } else {
      delete process.env.LEX_DEFAULT_BRANCH;
    }

    if (originalBranch !== undefined) {
      process.env.LEX_BRANCH = originalBranch;
    } else {
      delete process.env.LEX_BRANCH;
    }

    if (originalDefaultCommit !== undefined) {
      process.env.LEX_DEFAULT_COMMIT = originalDefaultCommit;
    } else {
      delete process.env.LEX_DEFAULT_COMMIT;
    }

    if (originalCommit !== undefined) {
      process.env.LEX_COMMIT = originalCommit;
    } else {
      delete process.env.LEX_COMMIT;
    }

    // Reset to default
    setGitMode("off");
  }

  test("default mode is 'off'", () => {
    try {
      assert.strictEqual(getGitMode(), "off", "Default mode should be 'off'");
      assert.strictEqual(gitIsEnabled(), false, "Git should be disabled by default");
    } finally {
      teardown();
    }
  });

  test("can switch to 'live' mode", () => {
    try {
      setGitMode("live");
      assert.strictEqual(getGitMode(), "live", "Mode should be 'live' after setting");
      assert.strictEqual(gitIsEnabled(), true, "Git should be enabled in 'live' mode");
    } finally {
      teardown();
    }
  });

  test("can switch back to 'off' mode", () => {
    try {
      setGitMode("live");
      assert.strictEqual(gitIsEnabled(), true, "Should be enabled after setting to 'live'");

      setGitMode("off");
      assert.strictEqual(getGitMode(), "off", "Should be 'off' after switching back");
      assert.strictEqual(gitIsEnabled(), false, "Should be disabled after switching to 'off'");
    } finally {
      teardown();
    }
  });

  test("mode persists across multiple calls", () => {
    try {
      setGitMode("live");

      // Multiple calls should return same value
      assert.strictEqual(getGitMode(), "live");
      assert.strictEqual(getGitMode(), "live");
      assert.strictEqual(gitIsEnabled(), true);
      assert.strictEqual(gitIsEnabled(), true);
    } finally {
      teardown();
    }
  });

  test("getEnvBranch returns undefined when no env vars set", () => {
    try {
      const branch = getEnvBranch();
      assert.strictEqual(branch, undefined, "Should return undefined when no env vars set");
    } finally {
      teardown();
    }
  });

  test("getEnvBranch returns LEX_DEFAULT_BRANCH when set", () => {
    try {
      process.env.LEX_DEFAULT_BRANCH = "main";
      const branch = getEnvBranch();
      assert.strictEqual(branch, "main", "Should return LEX_DEFAULT_BRANCH value");
    } finally {
      teardown();
    }
  });

  test("getEnvBranch returns LEX_BRANCH when LEX_DEFAULT_BRANCH not set", () => {
    try {
      process.env.LEX_BRANCH = "feature-branch";
      const branch = getEnvBranch();
      assert.strictEqual(branch, "feature-branch", "Should return LEX_BRANCH value");
    } finally {
      teardown();
    }
  });

  test("getEnvBranch prioritizes LEX_DEFAULT_BRANCH over LEX_BRANCH", () => {
    try {
      process.env.LEX_DEFAULT_BRANCH = "main";
      process.env.LEX_BRANCH = "feature-branch";
      const branch = getEnvBranch();
      assert.strictEqual(
        branch,
        "main",
        "Should prioritize LEX_DEFAULT_BRANCH over LEX_BRANCH",
      );
    } finally {
      teardown();
    }
  });

  test("getEnvCommit returns undefined when no env vars set", () => {
    try {
      const commit = getEnvCommit();
      assert.strictEqual(commit, undefined, "Should return undefined when no env vars set");
    } finally {
      teardown();
    }
  });

  test("getEnvCommit returns LEX_DEFAULT_COMMIT when set", () => {
    try {
      process.env.LEX_DEFAULT_COMMIT = "abc123";
      const commit = getEnvCommit();
      assert.strictEqual(commit, "abc123", "Should return LEX_DEFAULT_COMMIT value");
    } finally {
      teardown();
    }
  });

  test("getEnvCommit returns LEX_COMMIT when LEX_DEFAULT_COMMIT not set", () => {
    try {
      process.env.LEX_COMMIT = "def456";
      const commit = getEnvCommit();
      assert.strictEqual(commit, "def456", "Should return LEX_COMMIT value");
    } finally {
      teardown();
    }
  });

  test("getEnvCommit prioritizes LEX_DEFAULT_COMMIT over LEX_COMMIT", () => {
    try {
      process.env.LEX_DEFAULT_COMMIT = "abc123";
      process.env.LEX_COMMIT = "def456";
      const commit = getEnvCommit();
      assert.strictEqual(
        commit,
        "abc123",
        "Should prioritize LEX_DEFAULT_COMMIT over LEX_COMMIT",
      );
    } finally {
      teardown();
    }
  });

  test("gitIsEnabled correctly reflects mode state", () => {
    try {
      // Test 'off' mode
      setGitMode("off");
      assert.strictEqual(gitIsEnabled(), false, "Should be false in 'off' mode");

      // Test 'live' mode
      setGitMode("live");
      assert.strictEqual(gitIsEnabled(), true, "Should be true in 'live' mode");

      // Test switching back
      setGitMode("off");
      assert.strictEqual(gitIsEnabled(), false, "Should be false after switching back to 'off'");
    } finally {
      teardown();
    }
  });

  test("environment variables work with all modes", () => {
    try {
      process.env.LEX_DEFAULT_BRANCH = "develop";
      process.env.LEX_DEFAULT_COMMIT = "xyz789";

      // Test with 'off' mode
      setGitMode("off");
      assert.strictEqual(getEnvBranch(), "develop");
      assert.strictEqual(getEnvCommit(), "xyz789");

      // Test with 'live' mode
      setGitMode("live");
      assert.strictEqual(getEnvBranch(), "develop");
      assert.strictEqual(getEnvCommit(), "xyz789");
    } finally {
      teardown();
    }
  });
});
