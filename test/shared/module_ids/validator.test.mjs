/**
 * Tests for Module ID Validation (THE CRITICAL RULE)
 *
 * Run with: node shared/module_ids/validator.test.mjs
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
// Adjusted import path to built dist output
import {
  validateModuleIds,
} from "../../../dist/shared/module_ids/validator.js";

// Sample policy for testing
const samplePolicy = {
  modules: {
    "services/auth-core": {
      description: "Core authentication service",
      owns_paths: ["services/auth/**"],
      allowed_callers: ["ui/user-admin-panel"],
      forbidden_callers: [],
    },
    "services/user-access-api": {
      description: "User access API layer",
      owns_paths: ["services/userAccess/**"],
      allowed_callers: [],
      forbidden_callers: [],
    },
    "ui/user-admin-panel": {
      description: "User admin panel UI",
      owns_paths: ["web-ui/userAdmin/**"],
      allowed_callers: [],
      forbidden_callers: ["services/auth-core"],
    },
    "ui/login-page": {
      description: "Login page UI",
      owns_paths: ["web-ui/login/**"],
      allowed_callers: [],
      forbidden_callers: [],
    },
  },
};

// Sample alias table for async tests
const sampleAliasTable = {
  aliases: {
    "auth-core": {
      canonical: "services/auth-core",
      confidence: 1.0,
      reason: "shorthand",
    },
    "user-api": {
      canonical: "services/user-access-api",
      confidence: 1.0,
      reason: "shorthand",
    },
  },
};

describe("validateModuleIds (async with alias resolution)", () => {
  test("valid module IDs pass validation and return canonical IDs", async () => {
    const result = await validateModuleIds(
      ["services/auth-core", "ui/user-admin-panel"],
      samplePolicy
    );

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    assert.deepEqual(result.canonical, ["services/auth-core", "ui/user-admin-panel"]);
  });

  test("aliases resolve to canonical IDs", async () => {
    const result = await validateModuleIds(
      ["auth-core", "ui/user-admin-panel"],
      samplePolicy,
      sampleAliasTable
    );

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    assert.deepEqual(result.canonical, ["services/auth-core", "ui/user-admin-panel"]);
  });

  test("mix of aliases and canonical IDs works", async () => {
    const result = await validateModuleIds(
      ["auth-core", "services/user-access-api", "user-api"],
      samplePolicy,
      sampleAliasTable
    );

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    assert.deepEqual(result.canonical, [
      "services/auth-core",
      "services/user-access-api",
      "services/user-access-api",
    ]);
  });

  test("invalid canonical IDs fail with helpful error", async () => {
    const result = await validateModuleIds(["unknown-module"], samplePolicy, sampleAliasTable);

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].message.includes("unknown-module"));
    assert.ok(result.errors[0].message.includes("not found in policy"));
  });

  test("alias resolving to invalid ID fails", async () => {
    const badAliasTable = {
      aliases: {
        "bad-alias": {
          canonical: "nonexistent-module",
          confidence: 1.0,
          reason: "test",
        },
      },
    };

    const result = await validateModuleIds(["bad-alias"], samplePolicy, badAliasTable);

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(result.errors[0].message.includes("bad-alias"));
    assert.ok(result.errors[0].message.includes("nonexistent-module"));
  });

  test("empty module_scope returns empty canonical array", async () => {
    const result = await validateModuleIds([], samplePolicy);

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    assert.deepEqual(result.canonical, []);
  });

  test("preserves canonical IDs (never stores aliases)", async () => {
    const result = await validateModuleIds(
      ["auth-core", "user-api"],
      samplePolicy,
      sampleAliasTable
    );

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    // Should return canonical IDs, not the aliases
    assert.ok(!result.canonical.includes("auth-core"));
    assert.ok(!result.canonical.includes("user-api"));
    assert.ok(result.canonical.includes("services/auth-core"));
    assert.ok(result.canonical.includes("services/user-access-api"));
  });
});
