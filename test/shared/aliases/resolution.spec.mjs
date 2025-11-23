/**
 * Snapshot tests for alias resolution
 *
 * Tests that verify the complete resolution output format,
 * useful for detecting breaking changes in the alias system.
 *
 * Run with: node --test src/shared/aliases/resolution.spec.mjs
 * Update snapshots with: LEX_UPDATE_SNAPSHOTS=1 node --test src/shared/aliases/resolution.spec.mjs
 */

import { test, describe } from "node:test";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveModuleId, clearAliasTableCache } from "../../../dist/shared/aliases/resolver.js";

// Get directory for snapshots
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SNAPSHOTS_DIR = join(__dirname, "__snapshots__");
const SNAPSHOT_FILE = join(SNAPSHOTS_DIR, "resolution.spec.mjs.snap");

/**
 * Simple snapshot testing utility for Node.js test runner
 */
class SnapshotManager {
  constructor(snapshotFile) {
    this.snapshotFile = snapshotFile;
    this.snapshots = {};
    this.updateMode = process.env.LEX_UPDATE_SNAPSHOTS === "1";
    this.dirty = false;
    this.load();
  }

  load() {
    try {
      if (existsSync(this.snapshotFile)) {
        const content = readFileSync(this.snapshotFile, "utf-8");
        this.snapshots = JSON.parse(content);
      }
    } catch (error) {
      console.warn(`Could not load snapshots: ${error.message}`);
      this.snapshots = {};
    }
  }

  save() {
    if (!this.dirty) return;

    try {
      mkdirSync(dirname(this.snapshotFile), { recursive: true });
      writeFileSync(this.snapshotFile, JSON.stringify(this.snapshots, null, 2), "utf-8");
    } catch (error) {
      console.error(`Could not save snapshots: ${error.message}`);
    }
  }

  matchSnapshot(testName, value) {
    const serialized = JSON.stringify(value, null, 2);

    if (this.updateMode) {
      this.snapshots[testName] = serialized;
      this.dirty = true;
      return true;
    }

    if (!this.snapshots[testName]) {
      throw new Error(
        `Snapshot for "${testName}" does not exist. Run with LEX_UPDATE_SNAPSHOTS=1 to create.`
      );
    }

    const expected = this.snapshots[testName];
    if (serialized !== expected) {
      throw new Error(
        `Snapshot mismatch for "${testName}":\n\nExpected:\n${expected}\n\nReceived:\n${serialized}`
      );
    }

    return true;
  }
}

const snapshots = new SnapshotManager(SNAPSHOT_FILE);

// Save snapshots after all tests
process.on("exit", () => {
  snapshots.save();
});

// Sample policy for snapshot tests
const samplePolicy = {
  modules: {
    "src/cli/flags.ts": {
      description: "CLI flags module",
      owns_paths: ["src/cli/flags.ts"],
    },
    "src/cli/commands.ts": {
      description: "CLI commands module",
      owns_paths: ["src/cli/commands.ts"],
    },
    "src/gates/runner.ts": {
      description: "Gates runner module",
      owns_paths: ["src/gates/runner.ts"],
    },
    "services/auth-core": {
      description: "Authentication core service",
      owns_paths: ["services/auth/**"],
    },
    "services/user-api": {
      description: "User API service",
      owns_paths: ["services/users/**"],
    },
  },
};

describe("Snapshot Tests: Alias Resolution", () => {
  test("snapshot: complete alias map resolution", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        "cli-flags": {
          canonical: "src/cli/flags.ts",
          confidence: 1.0,
          reason: "shorthand",
        },
        "cli-commands": {
          canonical: "src/cli/commands.ts",
          confidence: 1.0,
          reason: "shorthand",
        },
        "gates-runner": {
          canonical: "src/gates/runner.ts",
          confidence: 1.0,
          reason: "shorthand",
        },
        auth: {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "common shorthand",
        },
        user: {
          canonical: "services/user-api",
          confidence: 1.0,
          reason: "common shorthand",
        },
      },
    };

    // Resolve all aliases
    const aliasResolutionMap = {};
    for (const alias of Object.keys(aliasTable.aliases)) {
      const result = await resolveModuleId(alias, samplePolicy, aliasTable);
      aliasResolutionMap[alias] = result.canonical;
    }

    // Snapshot the complete resolution map
    snapshots.matchSnapshot("alias-map-resolution", aliasResolutionMap);
  });

  test("snapshot: Frame moduleScope after aliasing", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        "cli-flags": {
          canonical: "src/cli/flags.ts",
          confidence: 1.0,
        },
        "gates-runner": {
          canonical: "src/gates/runner.ts",
          confidence: 1.0,
        },
      },
    };

    // Simulate user input with aliases
    const userInputModules = ["cli-flags", "src/cli/commands.ts", "gates-runner"];

    // Resolve all inputs to canonical IDs (as would be stored in Frame)
    const resolvedModuleScope = [];
    for (const input of userInputModules) {
      const result = await resolveModuleId(input, samplePolicy, aliasTable);
      resolvedModuleScope.push(result.canonical);
    }

    // Snapshot the final moduleScope that would be stored in Frame
    snapshots.matchSnapshot("frame-module-scope", resolvedModuleScope);
  });

  test("snapshot: resolution with mixed sources", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        auth: {
          canonical: "services/auth-core",
          confidence: 1.0,
        },
      },
    };

    // Test various resolution methods
    const testCases = [
      { input: "services/auth-core", description: "exact match" },
      { input: "auth", description: "alias match" },
      { input: "flags", description: "substring match" },
      { input: "unknown-module", description: "no match" },
    ];

    const resolutions = {};
    for (const testCase of testCases) {
      const result = await resolveModuleId(testCase.input, samplePolicy, aliasTable);
      resolutions[testCase.input] = {
        canonical: result.canonical,
        confidence: result.confidence,
        source: result.source,
        description: testCase.description,
      };
    }

    snapshots.matchSnapshot("mixed-source-resolutions", resolutions);
  });

  test("snapshot: alias resolution priority order", async () => {
    clearAliasTableCache();

    // Create scenario where same input could match multiple ways
    const aliasTable = {
      aliases: {
        "src/cli/flags.ts": {
          canonical: "services/auth-core", // Alias for exact module ID
          confidence: 1.0,
        },
      },
    };

    const result = await resolveModuleId("src/cli/flags.ts", samplePolicy, aliasTable);

    // Should prefer exact match over alias
    snapshots.matchSnapshot("priority-exact-over-alias", {
      input: "src/cli/flags.ts",
      canonical: result.canonical,
      source: result.source,
      confidence: result.confidence,
      note: "exact match takes precedence over alias lookup",
    });
  });
});

describe("Snapshot Tests: Error Cases", () => {
  test("snapshot: ambiguous substring resolution", async () => {
    clearAliasTableCache();

    // 'cli' matches both 'src/cli/flags.ts' and 'src/cli/commands.ts'
    const result = await resolveModuleId("cli", samplePolicy);

    snapshots.matchSnapshot("ambiguous-substring", {
      input: "cli",
      canonical: result.canonical,
      confidence: result.confidence,
      source: result.source,
      note: "ambiguous substring returns confidence 0",
    });
  });

  test("snapshot: unknown module resolution", async () => {
    clearAliasTableCache();

    const result = await resolveModuleId("completely-unknown", samplePolicy);

    snapshots.matchSnapshot("unknown-module", {
      input: "completely-unknown",
      canonical: result.canonical,
      confidence: result.confidence,
      source: result.source,
      note: "unknown returns original with confidence 0",
    });
  });

  test("snapshot: empty input resolution", async () => {
    clearAliasTableCache();

    const result = await resolveModuleId("", samplePolicy);

    snapshots.matchSnapshot("empty-input", {
      input: "",
      canonical: result.canonical,
      confidence: result.confidence,
      source: result.source,
    });
  });
});

describe("Snapshot Tests: Breaking Change Detection", () => {
  test("snapshot: resolution output format", async () => {
    clearAliasTableCache();

    const result = await resolveModuleId("services/auth-core", samplePolicy);

    // Snapshot the complete result structure
    // Any change to AliasResolution interface would break this
    snapshots.matchSnapshot("resolution-output-format", {
      canonical: result.canonical,
      confidence: result.confidence,
      original: result.original,
      source: result.source,
      typeCheck: {
        hasCanonical: typeof result.canonical === "string",
        hasConfidence: typeof result.confidence === "number",
        hasOriginal: typeof result.original === "string",
        hasSource: typeof result.source === "string",
        validSource: ["exact", "alias", "fuzzy", "substring"].includes(result.source),
      },
    });
  });

  test("snapshot: alias table structure", () => {
    const aliasTable = {
      aliases: {
        "test-alias": {
          canonical: "services/test",
          confidence: 1.0,
          reason: "test reason",
        },
      },
    };

    // Snapshot the expected alias table structure
    // Changes to AliasTable or AliasEntry interfaces would break this
    snapshots.matchSnapshot("alias-table-structure", {
      aliases: aliasTable.aliases,
      typeCheck: {
        isObject: typeof aliasTable.aliases === "object",
        hasEntries: Object.keys(aliasTable.aliases).length > 0,
        entryStructure: Object.values(aliasTable.aliases).map((entry) => ({
          hasCanonical: "canonical" in entry,
          hasConfidence: "confidence" in entry,
          hasReason: "reason" in entry,
          canonicalType: typeof entry.canonical,
          confidenceType: typeof entry.confidence,
          reasonType: typeof entry.reason,
        }))[0],
      },
    });
  });
});

describe("Snapshot Tests: Real-World Scenarios", () => {
  test("snapshot: batch resolution for /remember command", async () => {
    clearAliasTableCache();

    const aliasTable = {
      aliases: {
        auth: {
          canonical: "services/auth-core",
          confidence: 1.0,
        },
        user: {
          canonical: "services/user-api",
          confidence: 1.0,
        },
      },
    };

    // Simulate user typing mixed aliases and exact IDs
    const userInput = ["auth", "src/cli/flags.ts", "user", "gates"];

    const batchResolution = [];
    for (const input of userInput) {
      const result = await resolveModuleId(input, samplePolicy, aliasTable);
      batchResolution.push({
        input,
        canonical: result.canonical,
        confidence: result.confidence,
        source: result.source,
      });
    }

    snapshots.matchSnapshot("batch-remember-resolution", batchResolution);
  });

  test("snapshot: refactoring migration scenario", async () => {
    clearAliasTableCache();

    // Scenario: Module was refactored, old paths aliased to new
    const aliasTable = {
      aliases: {
        "old/auth/service": {
          canonical: "services/auth-core",
          confidence: 1.0,
          reason: "refactored 2025-10-15",
        },
        "legacy/user-access": {
          canonical: "services/user-api",
          confidence: 1.0,
          reason: "renamed 2025-11-01",
        },
      },
    };

    const oldPaths = ["old/auth/service", "legacy/user-access"];
    const migrations = {};

    for (const oldPath of oldPaths) {
      const result = await resolveModuleId(oldPath, samplePolicy, aliasTable);
      migrations[oldPath] = {
        newCanonical: result.canonical,
        migrationNote: aliasTable.aliases[oldPath]?.reason,
      };
    }

    snapshots.matchSnapshot("refactoring-migration", migrations);
  });
});

describe("Snapshot Update Instructions", () => {
  test("documentation: how to update snapshots", () => {
    const instructions = {
      command: "LEX_UPDATE_SNAPSHOTS=1 node --test src/shared/aliases/resolution.spec.mjs",
      purpose: "Updates snapshot files when the resolution output intentionally changes",
      when_to_update: [
        "Adding new fields to AliasResolution interface",
        "Changing resolution algorithm output",
        "Updating canonical module IDs in policy",
        "Modifying alias table structure",
      ],
      review_required: "Always review snapshot diffs in PR to ensure changes are intentional",
      location: "__snapshots__/resolution.spec.mjs.snap",
    };

    // This snapshot documents how to use snapshot testing
    snapshots.matchSnapshot("snapshot-update-instructions", instructions);
  });
});
