/**
 * Tests for Scanner Output Merge Logic
 *
 * Run with: node policy/merge/merge.test.mjs
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
// Adjusted import path to built dist output
import {
  mergeScans,
  validateScanOutputs,
  deduplicateEdges,
} from "../../../dist/policy/merge/merge.js";

describe("mergeScans", () => {
  test("successfully merges two scanner outputs", () => {
    const scan1 = {
      language: "typescript",
      files: [
        {
          path: "src/auth.ts",
          declarations: [{ type: "function", name: "login" }],
          imports: [{ from: "./utils", type: "import_statement" }],
          feature_flags: ["auth_v2"],
          permissions: ["can_login"],
          warnings: [],
        },
      ],
    };

    const scan2 = {
      language: "python",
      files: [
        {
          path: "api/users.py",
          declarations: [{ type: "class", name: "UserService" }],
          imports: [{ from: "auth", type: "import_statement" }],
          feature_flags: ["user_api"],
          permissions: ["can_manage_users"],
          warnings: [],
        },
      ],
    };

    const result = mergeScans([scan1, scan2]);

    assert.equal(result.version, "1.0.0");
    assert.equal(result.sources.length, 2);
    assert.ok(result.sources.includes("typescript"));
    assert.ok(result.sources.includes("python"));
    assert.equal(result.files.length, 2);
    assert.equal(result.warnings.length, 0);

    // Check that files are sorted
    assert.equal(result.files[0].path, "api/users.py");
    assert.equal(result.files[1].path, "src/auth.ts");
  });

  test("deduplicates identical edges", () => {
    const scan1 = {
      language: "typescript",
      files: [
        {
          path: "src/auth.ts",
          declarations: [],
          imports: [
            { from: "./utils", type: "import_statement" },
            { from: "./config", type: "import_statement" },
          ],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
    };

    const scan2 = {
      language: "typescript",
      files: [
        {
          path: "src/admin.ts",
          declarations: [],
          imports: [{ from: "./utils", type: "import_statement" }],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
    };

    const result = mergeScans([scan1, scan2]);

    // Should have 3 unique edges (auth->utils, auth->config, admin->utils)
    assert.equal(result.edges.length, 3);

    const edgeKeys = result.edges.map((e) => `${e.from}->${e.to}`);
    assert.ok(edgeKeys.includes("src/auth.ts->./utils"));
    assert.ok(edgeKeys.includes("src/auth.ts->./config"));
    assert.ok(edgeKeys.includes("src/admin.ts->./utils"));
  });

  test("detects and reports file ownership conflicts", () => {
    const scan1 = {
      language: "typescript",
      files: [
        {
          path: "src/shared.ts",
          declarations: [],
          imports: [],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
    };

    const scan2 = {
      language: "python",
      files: [
        {
          path: "src/shared.ts", // Same file path, different language
          declarations: [],
          imports: [],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
    };

    assert.throws(
      () => mergeScans([scan1, scan2]),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("File ownership conflicts"));
        assert.ok(error.message.includes("src/shared.ts"));
        assert.ok(error.message.includes("typescript"));
        assert.ok(error.message.includes("python"));
        return true;
      }
    );
  });

  test("handles empty scanner outputs", () => {
    const result = mergeScans([]);

    assert.equal(result.version, "1.0.0");
    assert.equal(result.sources.length, 0);
    assert.equal(result.files.length, 0);
    assert.equal(result.edges.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  test("handles scanner with no files", () => {
    const scan1 = {
      language: "typescript",
      files: [],
    };

    const result = mergeScans([scan1]);

    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0], "typescript");
    assert.equal(result.files.length, 0);
    assert.equal(result.edges.length, 0);
  });

  test("aggregates feature flags and permissions correctly", () => {
    const scan1 = {
      language: "typescript",
      files: [
        {
          path: "src/auth.ts",
          declarations: [],
          imports: [],
          feature_flags: ["auth_v2", "sso"],
          permissions: ["can_login", "can_logout"],
          warnings: [],
        },
      ],
    };

    const scan2 = {
      language: "python",
      files: [
        {
          path: "api/auth.py",
          declarations: [],
          imports: [],
          feature_flags: ["auth_v2", "oauth"],
          permissions: ["can_login", "can_refresh_token"],
          warnings: [],
        },
      ],
    };

    const result = mergeScans([scan1, scan2]);

    assert.equal(result.files.length, 2);

    // Check TypeScript file
    const tsFile = result.files.find((f) => f.path === "src/auth.ts");
    assert.ok(tsFile);
    assert.deepEqual(tsFile.feature_flags, ["auth_v2", "sso"]);
    assert.deepEqual(tsFile.permissions, ["can_login", "can_logout"]);

    // Check Python file
    const pyFile = result.files.find((f) => f.path === "api/auth.py");
    assert.ok(pyFile);
    assert.deepEqual(pyFile.feature_flags, ["auth_v2", "oauth"]);
    assert.deepEqual(pyFile.permissions, ["can_login", "can_refresh_token"]);
  });

  test("merges metadata when same scanner reports same file multiple times", () => {
    const scan1 = {
      language: "typescript",
      files: [
        {
          path: "src/utils.ts",
          declarations: [],
          imports: [],
          feature_flags: ["feature_a"],
          permissions: ["perm_a"],
          warnings: ["warning_1"],
        },
        {
          path: "src/utils.ts", // Duplicate in same scan
          declarations: [],
          imports: [],
          feature_flags: ["feature_b"],
          permissions: ["perm_b"],
          warnings: ["warning_2"],
        },
      ],
    };

    const result = mergeScans([scan1]);

    assert.equal(result.files.length, 1);
    const file = result.files[0];

    // Should merge and deduplicate
    assert.deepEqual(file.feature_flags, ["feature_a", "feature_b"]);
    assert.deepEqual(file.permissions, ["perm_a", "perm_b"]);
    assert.equal(file.warnings.length, 2);
  });

  test("handles missing module mappings gracefully", () => {
    // This test verifies that the merge works without a policy file
    // Module resolution happens in a separate step
    const scan1 = {
      language: "typescript",
      files: [
        {
          path: "src/unknown-module/file.ts",
          declarations: [],
          imports: [{ from: "../another-module/util", type: "import_statement" }],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
    };

    const result = mergeScans([scan1]);

    // Should succeed - module resolution is not part of merge
    assert.equal(result.files.length, 1);
    assert.equal(result.edges.length, 1);
    assert.equal(result.warnings.length, 0);
  });

  test("warns about invalid scanner output", () => {
    const validScan = {
      language: "typescript",
      files: [],
    };

    const invalidScan = {
      // Missing language field
      files: [],
    };

    const result = mergeScans([validScan, invalidScan]);

    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes("Invalid scanner output"));
  });

  test("creates deterministic output (idempotent merge)", () => {
    const scan1 = {
      language: "typescript",
      files: [
        {
          path: "src/b.ts",
          declarations: [],
          imports: [],
          feature_flags: ["flag_b"],
          permissions: [],
          warnings: [],
        },
        {
          path: "src/a.ts",
          declarations: [],
          imports: [],
          feature_flags: ["flag_a"],
          permissions: [],
          warnings: [],
        },
      ],
    };

    const result1 = mergeScans([scan1]);
    const result2 = mergeScans([scan1]);

    // Results should be identical
    assert.deepEqual(result1, result2);

    // Files should be sorted alphabetically
    assert.equal(result1.files[0].path, "src/a.ts");
    assert.equal(result1.files[1].path, "src/b.ts");
  });
});

describe("deduplicateEdges", () => {
  test("removes duplicate edges", () => {
    const edges = [
      { from: "moduleA", to: "moduleB" },
      { from: "moduleA", to: "moduleB" }, // Duplicate
      { from: "moduleB", to: "moduleC" },
      { from: "moduleA", to: "moduleB" }, // Another duplicate
    ];

    const result = deduplicateEdges(edges);

    assert.equal(result.length, 2);
    assert.equal(result[0].from, "moduleA");
    assert.equal(result[0].to, "moduleB");
    assert.equal(result[1].from, "moduleB");
    assert.equal(result[1].to, "moduleC");
  });

  test("preserves edge metadata from first occurrence", () => {
    const edges = [
      { from: "moduleA", to: "moduleB", source_file: "file1.ts" },
      { from: "moduleA", to: "moduleB", source_file: "file2.ts" },
    ];

    const result = deduplicateEdges(edges);

    assert.equal(result.length, 1);
    assert.equal(result[0].source_file, "file1.ts");
  });

  test("handles empty edge list", () => {
    const result = deduplicateEdges([]);
    assert.equal(result.length, 0);
  });
});

describe("validateScanOutputs", () => {
  test("validates correct scanner outputs", () => {
    const scans = [
      {
        language: "typescript",
        files: [
          {
            path: "src/test.ts",
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      },
    ];

    const result = validateScanOutputs(scans);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test("detects missing language field", () => {
    const scans = [
      {
        files: [],
      },
    ];

    const result = validateScanOutputs(scans);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("language")));
  });

  test("detects missing files array", () => {
    const scans = [
      {
        language: "typescript",
      },
    ];

    const result = validateScanOutputs(scans);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("files")));
  });

  test("detects invalid file structure", () => {
    const scans = [
      {
        language: "typescript",
        files: [
          {
            // Missing path
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      },
    ];

    const result = validateScanOutputs(scans);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("path")));
  });

  test("validates empty scanner list as valid", () => {
    const result = validateScanOutputs([]);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test("detects non-array scanner outputs", () => {
    const result = validateScanOutputs("not an array");

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("must be an array")));
  });
});
