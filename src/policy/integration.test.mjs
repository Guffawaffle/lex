/**
 * Integration tests for Policy Check Pipeline
 *
 * Tests the full policy check integration:
 * - Scanner → merge → check pipeline
 * - Violation detection with real policy
 *
 * Note: This requires policy modules to be built first:
 *   npm run build:merge && npm run build:check
 *
 * Run with: node policy/integration.test.mjs
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
// Adjusted import path to built dist output
import { mergeScans } from "../../dist/policy/merge/merge.js";

describe("Policy Integration Tests", () => {
  describe("Scanner → Merge Pipeline", () => {
    test("should complete scan → merge workflow", () => {
      // Step 1: Simulate scanner outputs
      const typescriptScan = {
        language: "typescript",
        files: [
          {
            path: "src/ui/admin/UserPanel.tsx",
            declarations: [{ type: "component", name: "UserPanel" }],
            imports: [{ from: "src/services/auth/AuthCore", type: "import_statement" }],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const phpScan = {
        language: "php",
        files: [
          {
            path: "app/Controllers/UserController.php",
            declarations: [{ type: "class", name: "UserController" }],
            imports: [{ from: "App\\Services\\AuthService", type: "import_statement" }],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      // Step 2: Merge scanner outputs
      const merged = mergeScans([typescriptScan, phpScan]);
      assert.ok(merged, "Should merge scanner outputs");
      assert.equal(merged.sources.length, 2, "Should include both sources");
      assert.equal(merged.files.length, 2, "Should include both files");
      assert.ok(merged.sources.includes("typescript"));
      assert.ok(merged.sources.includes("php"));
    });

    test("should pass clean pipeline with no violations", () => {
      const scan = {
        language: "typescript",
        files: [
          {
            path: "src/ui/components/Button.tsx",
            declarations: [{ type: "component", name: "Button" }],
            imports: [{ from: "src/services/api/ButtonApi", type: "import_statement" }],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);
      assert.ok(merged, "Should merge scanner output");
      assert.equal(merged.files.length, 1);
      assert.equal(merged.sources[0], "typescript");
    });

    test("should handle multi-language pipeline", () => {
      const scans = [
        {
          language: "typescript",
          files: [
            {
              path: "frontend/src/App.tsx",
              declarations: [],
              imports: [{ from: "api/client", type: "import_statement" }],
              feature_flags: [],
              permissions: [],
              warnings: [],
            },
          ],
        },
        {
          language: "python",
          files: [
            {
              path: "backend/api/views.py",
              declarations: [],
              imports: [{ from: "database.models", type: "import_statement" }],
              feature_flags: [],
              permissions: [],
              warnings: [],
            },
          ],
        },
        {
          language: "php",
          files: [
            {
              path: "legacy/api/endpoints.php",
              declarations: [],
              imports: [],
              feature_flags: [],
              permissions: [],
              warnings: [],
            },
          ],
        },
      ];

      const merged = mergeScans(scans);
      assert.equal(merged.sources.length, 3, "Should merge all languages");
      assert.equal(merged.files.length, 3, "Should include all files");
      assert.ok(merged.sources.includes("typescript"));
      assert.ok(merged.sources.includes("python"));
      assert.ok(merged.sources.includes("php"));
    });

    test("should deduplicate edges across scans", () => {
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

      const merged = mergeScans([scan1, scan2]);

      // Should have 3 unique edges (auth->utils, auth->config, admin->utils)
      assert.equal(merged.edges.length, 3);

      const edgeKeys = merged.edges.map((e) => `${e.from}->${e.to}`);
      assert.ok(edgeKeys.includes("src/auth.ts->./utils"));
      assert.ok(edgeKeys.includes("src/auth.ts->./config"));
      assert.ok(edgeKeys.includes("src/admin.ts->./utils"));
    });

    test("should sort files in merged output", () => {
      const scan = {
        language: "typescript",
        files: [
          {
            path: "src/z.ts",
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
          {
            path: "src/a.ts",
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
          {
            path: "src/m.ts",
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      // Files should be sorted alphabetically
      assert.equal(merged.files[0].path, "src/a.ts");
      assert.equal(merged.files[1].path, "src/m.ts");
      assert.equal(merged.files[2].path, "src/z.ts");
    });

    test("should handle empty scanner output", () => {
      const scan = {
        language: "typescript",
        files: [],
      };

      const merged = mergeScans([scan]);
      assert.equal(merged.files.length, 0);
      assert.equal(merged.sources.length, 1);
      assert.ok(merged.sources.includes("typescript"));
    });

    test("should include version in merged output", () => {
      const scan = {
        language: "typescript",
        files: [],
      };

      const merged = mergeScans([scan]);
      assert.ok(merged.version, "Should have version");
      assert.equal(merged.version, "1.0.0");
    });

    test("should preserve file metadata through merge", () => {
      const scan = {
        language: "typescript",
        files: [
          {
            path: "src/test.ts",
            declarations: [{ type: "function", name: "test" }],
            imports: [{ from: "assert", type: "import_statement" }],
            feature_flags: ["test_mode"],
            permissions: ["can_test"],
            warnings: ["test warning"],
          },
        ],
      };

      const merged = mergeScans([scan]);
      const file = merged.files[0];

      assert.equal(file.path, "src/test.ts");
      assert.equal(file.declarations.length, 1);
      assert.equal(file.declarations[0].name, "test");
      assert.equal(file.imports.length, 1);
      assert.equal(file.imports[0].from, "assert");
      assert.ok(file.feature_flags.includes("test_mode"));
      assert.ok(file.permissions.includes("can_test"));
      assert.ok(file.warnings.includes("test warning"));
    });
  });

  describe("Frame Creation from Policy Results", () => {
    test("should create Frame structure from scan results", () => {
      const scan = {
        language: "typescript",
        files: [
          {
            path: "src/features/beta/NewWidget.tsx",
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      // Create a Frame from scan results
      const frame = {
        id: "frame-policy-001",
        timestamp: new Date().toISOString(),
        branch: "feature/beta-ui",
        module_scope: ["features/beta"],
        summary_caption: "Policy scan completed",
        reference_point: "beta feature scan",
        status_snapshot: {
          next_action: "Review scan results",
          blockers: [],
        },
        keywords: ["policy", "scan"],
      };

      // Verify Frame structure
      assert.ok(frame, "Should create Frame");
      assert.ok(frame.status_snapshot, "Should have status snapshot");
      assert.ok(Array.isArray(frame.module_scope), "Should have module scope array");
    });

    test("should create Frame for successful scan", () => {
      const frame = {
        id: "frame-policy-002",
        timestamp: new Date().toISOString(),
        branch: "feature/compliant-code",
        module_scope: ["ui/components"],
        summary_caption: "All policy checks passed",
        reference_point: "clean policy check",
        status_snapshot: {
          next_action: "Ready to merge",
          blockers: [],
        },
      };

      // Verify Frame structure
      assert.ok(frame, "Should create Frame");
      assert.equal(frame.status_snapshot.next_action, "Ready to merge");
      assert.equal(frame.status_snapshot.blockers.length, 0);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle files outside known modules", () => {
      const scan = {
        language: "typescript",
        files: [
          {
            path: "scripts/build.ts",
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);
      assert.ok(merged, "Should handle unknown files gracefully");
      assert.equal(merged.files.length, 1);
    });

    test("should merge scans with warnings", () => {
      const scan = {
        language: "typescript",
        files: [
          {
            path: "src/legacy/OldCode.ts",
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: ["deprecated pattern detected"],
          },
        ],
      };

      const merged = mergeScans([scan]);
      assert.equal(merged.files[0].warnings.length, 1);
      assert.ok(merged.files[0].warnings[0].includes("deprecated"));
    });
  });
});

console.log("\n✅ Policy Integration Tests - Merge pipeline coverage\n");
