/**
 * Atlas HTTP Server Integration Tests
 *
 * Tests for POST /api/atlas/ingest endpoint with authentication
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Express } from "express";
import Database from "better-sqlite3-multiple-ciphers";
import { createHttpServer } from "../../../src/memory/mcp_server/http-server.js";
import { initializeDatabase } from "../../../src/memory/store/db.js";
import { getCodeAtlasRunById } from "../../../src/memory/store/code-atlas-runs.js";
import { getCodeUnitsByRepo } from "../../../src/memory/store/code-units.js";
import type { CodeAtlasRun } from "../../../src/atlas/schemas/code-atlas-run.js";
import type { CodeUnit } from "../../../src/atlas/schemas/code-unit.js";

/**
 * Create a valid CodeAtlasRun for testing
 */
function createTestRun(overrides: Partial<CodeAtlasRun> = {}): CodeAtlasRun {
  return {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    repoId: "test-repo-http",
    filesRequested: ["src/index.ts"],
    filesScanned: ["src/index.ts"],
    unitsEmitted: 1,
    limits: { maxFiles: 100 },
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
    repoId: "test-repo-http",
    filePath: "src/index.ts",
    language: "ts",
    kind: "function",
    symbolPath: "src/index.ts::testFunction",
    name: "testFunction",
    span: { startLine: 1, endLine: 10 },
    discoveredAt: new Date().toISOString(),
    schemaVersion: "code-unit-v0",
    ...overrides,
  };
}

describe("Atlas HTTP Server Integration", () => {
  let db: Database.Database;
  let app: Express;
  const testApiKey = "test-atlas-api-key-secure";

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");
    initializeDatabase(db);

    // Create HTTP server with test API key
    // Use a low rate limit for testing (10 requests)
    app = createHttpServer(db, {
      apiKey: testApiKey,
      port: 3000,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 10,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("Authentication", () => {
    it("should reject requests without Authorization header", async () => {
      const run = createTestRun();
      const response = await request(app)
        .post("/api/atlas/ingest")
        .send({ run, units: [] });

      assert.equal(response.status, 401);
      assert.equal(response.body.error, "UNAUTHORIZED");
    });

    it("should reject requests with invalid API key", async () => {
      const run = createTestRun();
      const response = await request(app)
        .post("/api/atlas/ingest")
        .set("Authorization", "Bearer wrong-api-key")
        .send({ run, units: [] });

      assert.equal(response.status, 401);
      assert.equal(response.body.error, "UNAUTHORIZED");
    });

    it("should accept requests with valid API key", async () => {
      const run = createTestRun();
      const response = await request(app)
        .post("/api/atlas/ingest")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({ run, units: [] });

      assert.equal(response.status, 201);
      assert.equal(response.body.runId, run.runId);
    });
  });

  describe("Ingestion", () => {
    it("should ingest run with units and persist to database", async () => {
      const run = createTestRun();
      const units = [
        createTestCodeUnit({ repoId: run.repoId }),
        createTestCodeUnit({
          repoId: run.repoId,
          id: `unit-2-${Date.now()}`,
          name: "helperFunction",
        }),
      ];

      const response = await request(app)
        .post("/api/atlas/ingest")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({ run, units });

      assert.equal(response.status, 201);
      assert.equal(response.body.unitsIngested, 2);
      assert.equal(response.body.unitsSkipped, 0);
      assert.ok(response.body.durationMs >= 0);

      // Verify data was persisted
      const savedRun = getCodeAtlasRunById(db, run.runId);
      assert.ok(savedRun);
      assert.equal(savedRun.runId, run.runId);

      const savedUnits = getCodeUnitsByRepo(db, run.repoId);
      assert.equal(savedUnits.length, 2);
    });

    it("should skip units with mismatched repoId", async () => {
      const run = createTestRun({ repoId: "repo-A" });
      const units = [
        createTestCodeUnit({ repoId: "repo-A", id: `unit-a-${Date.now()}` }),
        createTestCodeUnit({ repoId: "repo-B", id: `unit-b-${Date.now()}` }), // mismatched
      ];

      const response = await request(app)
        .post("/api/atlas/ingest")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({ run, units });

      assert.equal(response.status, 201);
      assert.equal(response.body.unitsIngested, 1);
      assert.equal(response.body.unitsSkipped, 1);
    });

    it("should return 400 for invalid run data", async () => {
      const response = await request(app)
        .post("/api/atlas/ingest")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({
          run: { invalidField: "value" },
          units: [],
        });

      assert.equal(response.status, 400);
      assert.equal(response.body.error, "VALIDATION_FAILED");
      assert.ok(Array.isArray(response.body.details));
    });

    it("should return 400 for invalid unit data", async () => {
      const run = createTestRun();
      const response = await request(app)
        .post("/api/atlas/ingest")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({
          run,
          units: [{ invalidUnit: true }],
        });

      assert.equal(response.status, 400);
      assert.equal(response.body.error, "VALIDATION_FAILED");
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits on atlas endpoint", async () => {
      // Make requests up to the limit (10 requests in our test config)
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post("/api/atlas/ingest")
            .set("Authorization", `Bearer ${testApiKey}`)
            .send({ run: createTestRun({ runId: `run-${i}` }), units: [] })
        );
      }

      const responses = await Promise.all(requests);

      // All 10 should succeed
      responses.forEach((response) => {
        assert.equal(response.status, 201);
      });

      // 11th request should be rate limited
      const rateLimitedResponse = await request(app)
        .post("/api/atlas/ingest")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({ run: createTestRun(), units: [] });

      assert.equal(rateLimitedResponse.status, 429);
      assert.equal(rateLimitedResponse.body.error, "RATE_LIMIT_EXCEEDED");
    });
  });
});
