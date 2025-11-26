/**
 * Atlas Query API Route Tests
 *
 * Tests for GET /api/atlas/units and GET /api/atlas/runs endpoints
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Express } from "express";
import Database from "better-sqlite3-multiple-ciphers";
import { createHttpServer } from "../../../src/memory/mcp_server/http-server.js";
import { initializeDatabase } from "../../../src/memory/store/db.js";
import { saveCodeUnit } from "../../../src/memory/store/code-unit-queries.js";
import { saveCodeAtlasRun } from "../../../src/memory/store/code-atlas-runs.js";
import type { CodeUnit } from "../../../src/atlas/schemas/code-unit.js";
import type { CodeAtlasRun } from "../../../src/atlas/schemas/code-atlas-run.js";

describe("Atlas Query API Routes", () => {
  let db: Database.Database;
  let app: Express;
  const testApiKey = "test-api-key-secure-random-string";

  // Sample code units for testing
  const sampleUnits: CodeUnit[] = [
    {
      id: "unit-1",
      repoId: "repo-1",
      filePath: "src/foo/bar.ts",
      language: "ts",
      kind: "function",
      symbolPath: "src/foo/bar.ts::myFunction",
      name: "myFunction",
      span: { startLine: 10, endLine: 20 },
      tags: ["test", "api"],
      discoveredAt: "2025-11-26T14:00:00Z",
      schemaVersion: "code-unit-v0",
    },
    {
      id: "unit-2",
      repoId: "repo-1",
      filePath: "src/foo/bar.ts",
      language: "ts",
      kind: "class",
      symbolPath: "src/foo/bar.ts::MyClass",
      name: "MyClass",
      span: { startLine: 30, endLine: 100 },
      tags: ["api"],
      discoveredAt: "2025-11-26T14:01:00Z",
      schemaVersion: "code-unit-v0",
    },
    {
      id: "unit-3",
      repoId: "repo-2",
      filePath: "src/utils/helper.ts",
      language: "ts",
      kind: "function",
      symbolPath: "src/utils/helper.ts::helperFn",
      name: "helperFn",
      span: { startLine: 1, endLine: 10 },
      discoveredAt: "2025-11-26T14:02:00Z",
      schemaVersion: "code-unit-v0",
    },
  ];

  // Sample atlas runs for testing
  const sampleRuns: CodeAtlasRun[] = [
    {
      runId: "run-1",
      repoId: "repo-1",
      filesRequested: ["src/foo/bar.ts"],
      filesScanned: ["src/foo/bar.ts"],
      unitsEmitted: 2,
      limits: { maxFiles: 100 },
      truncated: false,
      createdAt: "2025-11-26T14:00:00Z",
      schemaVersion: "code-atlas-run-v0",
    },
    {
      runId: "run-2",
      repoId: "repo-2",
      filesRequested: ["src/utils/helper.ts"],
      filesScanned: ["src/utils/helper.ts"],
      unitsEmitted: 1,
      limits: { maxFiles: 50 },
      truncated: false,
      createdAt: "2025-11-26T14:05:00Z",
      schemaVersion: "code-atlas-run-v0",
    },
  ];

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");
    initializeDatabase(db);

    // Insert sample data
    for (const unit of sampleUnits) {
      saveCodeUnit(db, unit);
    }
    for (const run of sampleRuns) {
      saveCodeAtlasRun(db, run);
    }

    // Create HTTP server with test API key
    app = createHttpServer(db, {
      apiKey: testApiKey,
      port: 3000,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("GET /api/atlas/units", () => {
    it("should require authentication", async () => {
      const response = await request(app).get("/api/atlas/units");

      assert.equal(response.status, 401);
      assert.equal(response.body.error, "UNAUTHORIZED");
    });

    it("should return all code units with pagination info", async () => {
      const response = await request(app)
        .get("/api/atlas/units")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 3);
      assert.equal(response.body.items.length, 3);
      assert.equal(response.body.limit, 100);
      assert.equal(response.body.offset, 0);
    });

    it("should filter by repository", async () => {
      const response = await request(app)
        .get("/api/atlas/units?repo=repo-1")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 2);
      assert.equal(response.body.items.length, 2);
      assert.ok(response.body.items.every((u: CodeUnit) => u.repoId === "repo-1"));
    });

    it("should filter by kind", async () => {
      const response = await request(app)
        .get("/api/atlas/units?kind=function")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 2);
      assert.ok(response.body.items.every((u: CodeUnit) => u.kind === "function"));
    });

    it("should filter by file path (prefix match)", async () => {
      const response = await request(app)
        .get("/api/atlas/units?file=src/foo")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 2);
      assert.ok(response.body.items.every((u: CodeUnit) => u.filePath.startsWith("src/foo")));
    });

    it("should filter by symbol path", async () => {
      const response = await request(app)
        .get("/api/atlas/units?symbol=MyClass")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 1);
      assert.equal(response.body.items[0].name, "MyClass");
    });

    it("should filter by tags with AND logic", async () => {
      const response = await request(app)
        .get("/api/atlas/units?tags=test,api")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 1);
      assert.equal(response.body.items[0].id, "unit-1");
    });

    it("should support pagination with limit and offset", async () => {
      const response = await request(app)
        .get("/api/atlas/units?limit=2&offset=1")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 3);
      assert.equal(response.body.items.length, 2);
      assert.equal(response.body.limit, 2);
      assert.equal(response.body.offset, 1);
    });

    it("should combine multiple filters", async () => {
      const response = await request(app)
        .get("/api/atlas/units?repo=repo-1&kind=function")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 1);
      assert.equal(response.body.items[0].id, "unit-1");
    });

    it("should return empty array for no matches", async () => {
      const response = await request(app)
        .get("/api/atlas/units?repo=nonexistent")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 0);
      assert.equal(response.body.items.length, 0);
    });

    it("should reject invalid kind value", async () => {
      const response = await request(app)
        .get("/api/atlas/units?kind=invalid")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 400);
      assert.equal(response.body.error, "VALIDATION_FAILED");
    });
  });

  describe("GET /api/atlas/units/:id", () => {
    it("should require authentication", async () => {
      const response = await request(app).get("/api/atlas/units/unit-1");

      assert.equal(response.status, 401);
      assert.equal(response.body.error, "UNAUTHORIZED");
    });

    it("should return a specific code unit by ID", async () => {
      const response = await request(app)
        .get("/api/atlas/units/unit-1")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.id, "unit-1");
      assert.equal(response.body.name, "myFunction");
      assert.equal(response.body.kind, "function");
      assert.equal(response.body.repoId, "repo-1");
    });

    it("should return 404 for non-existent unit", async () => {
      const response = await request(app)
        .get("/api/atlas/units/nonexistent")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 404);
      assert.equal(response.body.error, "NOT_FOUND");
      assert.ok(response.body.message.includes("nonexistent"));
    });
  });

  describe("GET /api/atlas/runs", () => {
    it("should require authentication", async () => {
      const response = await request(app).get("/api/atlas/runs");

      assert.equal(response.status, 401);
      assert.equal(response.body.error, "UNAUTHORIZED");
    });

    it("should return all runs with pagination info", async () => {
      const response = await request(app)
        .get("/api/atlas/runs")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 2);
      assert.equal(response.body.items.length, 2);
      assert.equal(response.body.limit, 100);
      assert.equal(response.body.offset, 0);
    });

    it("should filter by repository", async () => {
      const response = await request(app)
        .get("/api/atlas/runs?repo=repo-1")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 1);
      assert.equal(response.body.items.length, 1);
      assert.equal(response.body.items[0].repoId, "repo-1");
    });

    it("should support pagination", async () => {
      const response = await request(app)
        .get("/api/atlas/runs?limit=1&offset=1")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.total, 2);
      assert.equal(response.body.items.length, 1);
      assert.equal(response.body.limit, 1);
      assert.equal(response.body.offset, 1);
    });
  });

  describe("GET /api/atlas/runs/:runId", () => {
    it("should require authentication", async () => {
      const response = await request(app).get("/api/atlas/runs/run-1");

      assert.equal(response.status, 401);
      assert.equal(response.body.error, "UNAUTHORIZED");
    });

    it("should return a specific run by ID", async () => {
      const response = await request(app)
        .get("/api/atlas/runs/run-1")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.runId, "run-1");
      assert.equal(response.body.repoId, "repo-1");
      assert.equal(response.body.unitsEmitted, 2);
    });

    it("should return 404 for non-existent run", async () => {
      const response = await request(app)
        .get("/api/atlas/runs/nonexistent")
        .set("Authorization", `Bearer ${testApiKey}`);

      assert.equal(response.status, 404);
      assert.equal(response.body.error, "NOT_FOUND");
      assert.ok(response.body.message.includes("nonexistent"));
    });
  });
});
