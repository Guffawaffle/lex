/**
 * Atlas Ingestion API Tests
 *
 * Tests for POST /api/atlas/ingest endpoint
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import Database from "better-sqlite3-multiple-ciphers";
import { initializeDatabase } from "@app/memory/store/db.js";
import { createAtlasRouter } from "@app/memory/mcp_server/routes/atlas.js";
import { getCodeAtlasRunById } from "@app/memory/store/code-atlas-runs.js";
import { getCodeUnitsByRepo } from "@app/memory/store/code-units.js";
import type { CodeAtlasRun } from "@app/atlas/schemas/code-atlas-run.js";
import type { CodeUnit } from "@app/atlas/schemas/code-unit.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-atlas-api-${Date.now()}.db`);

/**
 * Create a valid CodeAtlasRun for testing
 */
function createTestRun(overrides: Partial<CodeAtlasRun> = {}): CodeAtlasRun {
  return {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    repoId: "test-repo-1",
    filesRequested: ["src/index.ts", "src/utils.ts"],
    filesScanned: ["src/index.ts", "src/utils.ts"],
    unitsEmitted: 3,
    limits: { maxFiles: 100, maxBytes: 1000000 },
    truncated: false,
    strategy: "static",
    createdAt: new Date().toISOString(),
    schemaVersion: "code-atlas-run-v0",
    ...overrides,
  };
}

/**
 * Create a valid CodeUnit for testing
 */
function createTestCodeUnit(overrides: Partial<CodeUnit> = {}): CodeUnit {
  const id = `unit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    repoId: "test-repo-1",
    filePath: "src/index.ts",
    language: "ts",
    kind: "function",
    symbolPath: "src/index.ts::myFunction",
    name: "myFunction",
    span: { startLine: 1, endLine: 10 },
    discoveredAt: new Date().toISOString(),
    schemaVersion: "code-unit-v0",
    ...overrides,
  };
}

/**
 * Helper to simulate HTTP request
 */
async function simulateRequest(
  router: ReturnType<typeof createAtlasRouter>,
  path: string,
  body: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const req = {
      method: "POST",
      url: path,
      body,
      headers: {
        "content-type": "application/json",
      },
    } as unknown as import("express").Request;

    const res = {
      statusCode: 200,
      _body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: unknown) {
        this._body = data;
        resolve({
          status: this.statusCode,
          body: this._body as Record<string, unknown>,
        });
      },
    } as unknown as import("express").Response;

    // Call the router handler
    // We need to call the actual route handler
    const handlers = (router as unknown as { stack: Array<{ route: { path: string; methods: { post: boolean } }; handle: Function }> }).stack;
    const ingestRoute = handlers.find(
      (h) => h.route && h.route.path === "/ingest" && h.route.methods.post
    );
    if (ingestRoute) {
      ingestRoute.handle(req, res, () => {});
    } else {
      resolve({ status: 404, body: { error: "Route not found" } });
    }
  });
}

describe("Atlas Ingestion API Tests", () => {
  let db: Database.Database;
  let router: ReturnType<typeof createAtlasRouter>;

  before(() => {
    // Create test database
    db = new Database(TEST_DB_PATH);
    initializeDatabase(db);
    router = createAtlasRouter(db);
  });

  after(() => {
    // Clean up test database
    db.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("POST /api/atlas/ingest", () => {
    test("should ingest a valid run with units and return 201", async () => {
      const run = createTestRun();
      const units = [
        createTestCodeUnit({ repoId: run.repoId }),
        createTestCodeUnit({
          repoId: run.repoId,
          id: `unit-2-${Date.now()}`,
          name: "helperFunction",
        }),
      ];

      const response = await simulateRequest(router, "/ingest", { run, units });

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.runId, run.runId);
      assert.strictEqual(response.body.unitsIngested, 2);
      assert.strictEqual(response.body.unitsSkipped, 0);
      assert.ok(typeof response.body.durationMs === "number");

      // Verify data was persisted
      const savedRun = getCodeAtlasRunById(db, run.runId);
      assert.ok(savedRun);
      assert.strictEqual(savedRun.runId, run.runId);

      const savedUnits = getCodeUnitsByRepo(db, run.repoId);
      assert.ok(savedUnits.length >= 2);
    });

    test("should ingest run with empty units array", async () => {
      const run = createTestRun({
        runId: `run-empty-${Date.now()}`,
        unitsEmitted: 0,
      });

      const response = await simulateRequest(router, "/ingest", { run, units: [] });

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.runId, run.runId);
      assert.strictEqual(response.body.unitsIngested, 0);
      assert.strictEqual(response.body.unitsSkipped, 0);
    });

    test("should skip units with mismatched repoId", async () => {
      const run = createTestRun({
        runId: `run-mismatch-${Date.now()}`,
        repoId: "repo-A",
      });
      const units = [
        createTestCodeUnit({ repoId: "repo-A", id: `unit-a-${Date.now()}` }),
        createTestCodeUnit({ repoId: "repo-B", id: `unit-b-${Date.now()}` }), // mismatched
        createTestCodeUnit({ repoId: "repo-A", id: `unit-c-${Date.now()}` }),
      ];

      const response = await simulateRequest(router, "/ingest", { run, units });

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.unitsIngested, 2);
      assert.strictEqual(response.body.unitsSkipped, 1);
    });

    test("should return 400 for missing run field", async () => {
      const response = await simulateRequest(router, "/ingest", {
        units: [createTestCodeUnit()],
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error, "VALIDATION_FAILED");
      assert.ok(Array.isArray(response.body.details));
    });

    test("should return 400 for missing units field", async () => {
      const response = await simulateRequest(router, "/ingest", {
        run: createTestRun(),
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error, "VALIDATION_FAILED");
    });

    test("should return 400 for invalid run schemaVersion", async () => {
      const invalidRun = {
        ...createTestRun(),
        schemaVersion: "invalid-version",
      };

      const response = await simulateRequest(router, "/ingest", {
        run: invalidRun,
        units: [],
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error, "VALIDATION_FAILED");
    });

    test("should return 400 for invalid unit kind", async () => {
      const run = createTestRun();
      const invalidUnit = {
        ...createTestCodeUnit({ repoId: run.repoId }),
        kind: "invalid-kind",
      };

      const response = await simulateRequest(router, "/ingest", {
        run,
        units: [invalidUnit],
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error, "VALIDATION_FAILED");
    });

    test("should return 400 for invalid unit span (non-positive line)", async () => {
      const run = createTestRun();
      const invalidUnit = {
        ...createTestCodeUnit({ repoId: run.repoId }),
        span: { startLine: 0, endLine: 10 },
      };

      const response = await simulateRequest(router, "/ingest", {
        run,
        units: [invalidUnit],
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error, "VALIDATION_FAILED");
    });

    test("should handle optional fields in units", async () => {
      const run = createTestRun({ runId: `run-optional-${Date.now()}` });
      const unitWithOptionals = {
        ...createTestCodeUnit({
          repoId: run.repoId,
          id: `unit-optional-${Date.now()}`,
        }),
        tags: ["test", "api"],
        docComment: "This is a test function",
      };

      const response = await simulateRequest(router, "/ingest", {
        run,
        units: [unitWithOptionals],
      });

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.unitsIngested, 1);
    });

    test("should handle all valid code unit kinds", async () => {
      const run = createTestRun({ runId: `run-kinds-${Date.now()}` });
      const kinds = ["module", "class", "function", "method"] as const;
      const units = kinds.map((kind, i) =>
        createTestCodeUnit({
          repoId: run.repoId,
          id: `unit-kind-${kind}-${Date.now()}-${i}`,
          kind,
          name: `${kind}Name`,
        })
      );

      const response = await simulateRequest(router, "/ingest", { run, units });

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.unitsIngested, 4);
    });

    test("should handle strategy field with all valid values", async () => {
      const strategies = ["static", "llm-assisted", "mixed"] as const;

      for (const strategy of strategies) {
        const run = createTestRun({
          runId: `run-strategy-${strategy}-${Date.now()}`,
          strategy,
        });

        const response = await simulateRequest(router, "/ingest", {
          run,
          units: [],
        });

        assert.strictEqual(response.status, 201, `Strategy ${strategy} should be valid`);
      }
    });
  });
});
