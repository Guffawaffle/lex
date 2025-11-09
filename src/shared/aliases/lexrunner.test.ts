/**
 * LexRunner Alias Resolution Tests
 *
 * Tests alias resolution specifically in LexRunner contexts:
 * - PR module ID validation
 * - Merge sequence continuity
 * - Strict mode for CI
 * - Historical renames
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { resolveModuleId, loadAliasTable } from "../../../dist/shared/aliases/resolver.js";
import type { Policy } from "../../../dist/shared/types/policy.js";

// Sample policy for LexRunner testing
const lexrunnerPolicy: Policy = {
  modules: {
    "services/auth-core": {
      description: "Core authentication service",
      owns_paths: ["services/auth/**"],
      dependencies_allowed: ["infrastructure/database"],
    },
    "api/user-access": {
      description: "User access API",
      owns_paths: ["api/user/**"],
      dependencies_allowed: ["services/auth-core"],
    },
    "ui/admin-panel": {
      description: "Admin panel UI",
      owns_paths: ["ui/admin/**"],
      dependencies_allowed: ["api/user-access"],
    },
    "infrastructure/database": {
      description: "Database layer",
      owns_paths: ["infra/db/**"],
      dependencies_allowed: [],
    },
    "infrastructure/redis-cache": {
      description: "Redis cache layer",
      owns_paths: ["infra/cache/**"],
      dependencies_allowed: [],
    },
  },
};

// Sample alias table for LexRunner team
const lexrunnerAliases = {
  aliases: {
    auth: {
      canonical: "services/auth-core",
      confidence: 1.0,
      reason: "team shorthand",
    },
    "auth-core": {
      canonical: "services/auth-core",
      confidence: 1.0,
      reason: "alternate shorthand",
    },
    "user-api": {
      canonical: "api/user-access",
      confidence: 1.0,
      reason: "team shorthand",
    },
    "ui-admin": {
      canonical: "ui/admin-panel",
      confidence: 1.0,
      reason: "team shorthand",
    },
    db: {
      canonical: "infrastructure/database",
      confidence: 1.0,
      reason: "common abbreviation",
    },
    cache: {
      canonical: "infrastructure/redis-cache",
      confidence: 1.0,
      reason: "common abbreviation",
    },
    // Historical rename
    "services/user-access-api": {
      canonical: "api/user-access",
      confidence: 1.0,
      reason: "refactored 2025-11-09",
    },
  },
};

describe("LexRunner: PR Module ID Validation", () => {
  test("should resolve team shorthand aliases for PR modules", async () => {
    // Simulate PR touching modules using team shorthand
    const prModules = ["auth", "user-api", "ui-admin"];

    const resolved = await Promise.all(
      prModules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );

    // All should resolve with confidence 1.0
    assert.equal(resolved[0].canonical, "services/auth-core");
    assert.equal(resolved[0].confidence, 1.0);
    assert.equal(resolved[0].source, "alias");

    assert.equal(resolved[1].canonical, "api/user-access");
    assert.equal(resolved[1].confidence, 1.0);
    assert.equal(resolved[1].source, "alias");

    assert.equal(resolved[2].canonical, "ui/admin-panel");
    assert.equal(resolved[2].confidence, 1.0);
    assert.equal(resolved[2].source, "alias");
  });

  test("should accept exact module IDs without alias lookup", async () => {
    const prModules = ["services/auth-core", "api/user-access"];

    const resolved = await Promise.all(
      prModules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );

    // Should be exact matches, not alias matches
    assert.equal(resolved[0].source, "exact");
    assert.equal(resolved[1].source, "exact");
    assert.equal(resolved[0].confidence, 1.0);
    assert.equal(resolved[1].confidence, 1.0);
  });

  test("should handle mixed exact and alias usage in same PR", async () => {
    const prModules = ["services/auth-core", "db", "user-api"];

    const resolved = await Promise.all(
      prModules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );

    assert.equal(resolved[0].canonical, "services/auth-core");
    assert.equal(resolved[0].source, "exact");

    assert.equal(resolved[1].canonical, "infrastructure/database");
    assert.equal(resolved[1].source, "alias");

    assert.equal(resolved[2].canonical, "api/user-access");
    assert.equal(resolved[2].source, "alias");
  });

  test("should reject invalid module IDs", async () => {
    const invalidModule = "nonexistent-module";

    const resolution = await resolveModuleId(
      invalidModule,
      lexrunnerPolicy,
      lexrunnerAliases,
      { noSubstring: true }
    );

    assert.equal(resolution.confidence, 0);
    assert.equal(resolution.original, invalidModule);
  });
});

describe("LexRunner: Merge Sequence Continuity", () => {
  test("should maintain continuity across module rename", async () => {
    // Before rename: module was "services/user-access-api"
    // After rename: module is "api/user-access"
    // Alias maps old → new

    const oldModuleId = "services/user-access-api";
    const resolution = await resolveModuleId(oldModuleId, lexrunnerPolicy, lexrunnerAliases);

    assert.equal(resolution.canonical, "api/user-access");
    assert.equal(resolution.confidence, 1.0);
    assert.equal(resolution.source, "alias");
  });

  test("should allow querying frames with either old or new module ID", async () => {
    // Simulate frame data with both old and new IDs
    const frames = [
      { id: "frame-1", moduleScope: ["services/user-access-api"] }, // Old frame
      { id: "frame-2", moduleScope: ["api/user-access"] }, // New frame
    ];

    // Resolve both to canonical form
    const resolution1 = await resolveModuleId(
      "services/user-access-api",
      lexrunnerPolicy,
      lexrunnerAliases
    );
    const resolution2 = await resolveModuleId("api/user-access", lexrunnerPolicy, lexrunnerAliases);

    // Both should resolve to same canonical ID
    assert.equal(resolution1.canonical, resolution2.canonical);
    assert.equal(resolution1.canonical, "api/user-access");
  });

  test("should handle multi-PR sequence with mid-sequence rename", async () => {
    // Simulate PRs in sequence
    const pr100Modules = ["services/auth-core", "services/user-access-api"]; // Before rename
    const pr101Modules = ["services/user-access-api"]; // Before rename
    const pr102Modules = ["api/user-access"]; // After rename
    const pr103Modules = ["api/user-access", "ui/admin-panel"]; // After rename

    const resolved100 = await Promise.all(
      pr100Modules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );
    const resolved101 = await Promise.all(
      pr101Modules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );
    const resolved102 = await Promise.all(
      pr102Modules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );
    const resolved103 = await Promise.all(
      pr103Modules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );

    // All should resolve successfully with confidence 1.0
    assert.ok(resolved100.every((r) => r.confidence === 1.0));
    assert.ok(resolved101.every((r) => r.confidence === 1.0));
    assert.ok(resolved102.every((r) => r.confidence === 1.0));
    assert.ok(resolved103.every((r) => r.confidence === 1.0));

    // User-access module should resolve to canonical form in all cases
    const userAccessResolutions = [
      resolved100.find((r) => r.original === "services/user-access-api"),
      resolved101.find((r) => r.original === "services/user-access-api"),
      resolved102[0],
      resolved103.find((r) => r.original === "api/user-access"),
    ];

    userAccessResolutions.forEach((r) => {
      assert.equal(r!.canonical, "api/user-access");
    });
  });
});

describe("LexRunner: Strict Mode (CI)", () => {
  test("should accept exact matches in strict mode", async () => {
    const resolution = await resolveModuleId("services/auth-core", lexrunnerPolicy, lexrunnerAliases, {
      noSubstring: true,
    });

    assert.equal(resolution.confidence, 1.0);
    assert.equal(resolution.source, "exact");
  });

  test("should accept explicit aliases in strict mode", async () => {
    const resolution = await resolveModuleId("auth", lexrunnerPolicy, lexrunnerAliases, {
      noSubstring: true,
    });

    assert.equal(resolution.confidence, 1.0);
    assert.equal(resolution.source, "alias");
  });

  test("should reject substring matches in strict mode", async () => {
    // "auth-core" would match as substring normally
    const resolution = await resolveModuleId("auth-cor", lexrunnerPolicy, lexrunnerAliases, {
      noSubstring: true,
    });

    // In strict mode, substring matches are disabled
    assert.equal(resolution.confidence, 0);
  });

  test("should reject typos in strict mode", async () => {
    const resolution = await resolveModuleId("services/auth-cor", lexrunnerPolicy, lexrunnerAliases, {
      noSubstring: true,
    });

    assert.equal(resolution.confidence, 0);
  });

  test("strict mode validation pattern for CI", async () => {
    // Simulate CI validation
    const prModules = ["auth", "services/auth-core", "typo-module"];
    const results = await Promise.all(
      prModules.map((id) =>
        resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases, { noSubstring: true })
      )
    );

    const validModules = results.filter((r) => r.confidence === 1.0);
    const invalidModules = results.filter((r) => r.confidence < 1.0);

    assert.equal(validModules.length, 2); // "auth" and "services/auth-core"
    assert.equal(invalidModules.length, 1); // "typo-module"
  });
});

describe("LexRunner: Cross-Team Alias Support", () => {
  test("should support multiple aliases pointing to same module", async () => {
    // Both "auth" and "auth-core" should resolve to same canonical ID
    const resolution1 = await resolveModuleId("auth", lexrunnerPolicy, lexrunnerAliases);
    const resolution2 = await resolveModuleId("auth-core", lexrunnerPolicy, lexrunnerAliases);

    assert.equal(resolution1.canonical, "services/auth-core");
    assert.equal(resolution2.canonical, "services/auth-core");
    assert.equal(resolution1.canonical, resolution2.canonical);
  });

  test("should allow different teams to use different shorthands", async () => {
    // Team A uses "auth", Team B uses "auth-core"
    const teamAModules = ["auth", "user-api"];
    const teamBModules = ["auth-core", "user-api"];

    const teamAResolved = await Promise.all(
      teamAModules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );
    const teamBResolved = await Promise.all(
      teamBModules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );

    // Both teams' PRs should resolve to same canonical IDs
    assert.equal(teamAResolved[0].canonical, "services/auth-core");
    assert.equal(teamBResolved[0].canonical, "services/auth-core");
  });
});

describe("LexRunner: Common Abbreviations", () => {
  test("should support infrastructure abbreviations", async () => {
    const infra = ["db", "cache"];

    const resolved = await Promise.all(
      infra.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );

    assert.equal(resolved[0].canonical, "infrastructure/database");
    assert.equal(resolved[1].canonical, "infrastructure/redis-cache");
    assert.ok(resolved.every((r) => r.confidence === 1.0));
  });

  test("should handle full infrastructure paths alongside abbreviations", async () => {
    const mixed = ["db", "infrastructure/redis-cache"];

    const resolved = await Promise.all(
      mixed.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases))
    );

    assert.equal(resolved[0].canonical, "infrastructure/database");
    assert.equal(resolved[0].source, "alias");

    assert.equal(resolved[1].canonical, "infrastructure/redis-cache");
    assert.equal(resolved[1].source, "exact");
  });
});

describe("LexRunner: Performance and Caching", () => {
  test("should cache alias table across multiple resolutions", async () => {
    // Multiple resolutions should reuse cached table
    const modules = ["auth", "user-api", "ui-admin", "db", "cache"];

    const startTime = Date.now();
    await Promise.all(modules.map((id) => resolveModuleId(id, lexrunnerPolicy, lexrunnerAliases)));
    const duration = Date.now() - startTime;

    // Should be fast (< 100ms for 5 modules)
    assert.ok(duration < 100, `Resolution took ${duration}ms, expected < 100ms`);
  });

  test("exact matches should bypass alias lookup (performance)", async () => {
    const exact = "services/auth-core";

    const resolution = await resolveModuleId(exact, lexrunnerPolicy, lexrunnerAliases);

    // Should be exact match, not alias
    assert.equal(resolution.source, "exact");
    assert.equal(resolution.confidence, 1.0);
  });
});

describe("LexRunner: Error Scenarios", () => {
  test("should handle empty alias table gracefully", async () => {
    const emptyAliases = { aliases: {} };

    // Should fall back to substring matching
    const resolution = await resolveModuleId("auth-core", lexrunnerPolicy, emptyAliases);

    // Should find substring match
    assert.equal(resolution.canonical, "services/auth-core");
    assert.equal(resolution.confidence, 0.9);
    assert.equal(resolution.source, "substring");
  });

  test("should handle completely unknown module", async () => {
    const unknown = "completely-unknown-module";

    const resolution = await resolveModuleId(unknown, lexrunnerPolicy, lexrunnerAliases, {
      noSubstring: true,
    });

    assert.equal(resolution.confidence, 0);
    assert.equal(resolution.canonical, unknown); // Returns input unchanged
  });

  test("should handle ambiguous substring (multiple matches)", async () => {
    // "user" could match both "api/user-access" and potentially other modules
    const ambiguous = "infra";

    const resolution = await resolveModuleId(ambiguous, lexrunnerPolicy, lexrunnerAliases);

    // Should either match uniquely or return 0 confidence if ambiguous
    // In this case, "infra" matches both "infrastructure/database" and "infrastructure/redis-cache"
    assert.equal(resolution.confidence, 0); // Ambiguous
  });
});
