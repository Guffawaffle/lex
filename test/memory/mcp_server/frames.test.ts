/**
 * Frame Ingestion API Tests
 *
 * Tests for POST /api/frames endpoint
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import express, { Express } from "express";
import { createDatabase } from "@app/memory/store/db.js";
import { createFramesRouter } from "@app/memory/mcp_server/routes/frames.js";
import type Database from "better-sqlite3";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-frames-api-${Date.now()}.db`);
const TEST_API_KEY = "test-api-key-12345";

// Helper to make requests to the router
async function makeRequest(
  app: Express,
  options: {
    method: string;
    path: string;
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<{
  status: number;
  body: any;
}> {
  return new Promise((resolve) => {
    const req = {
      method: options.method,
      path: options.path,
      body: options.body || {},
      headers: options.headers || {},
    } as any;

    const res = {
      statusCode: 200,
      _body: null as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this._body = data;
        resolve({
          status: this.statusCode,
          body: this._body,
        });
      },
    } as any;

    // Execute middleware stack
    app._router.handle(req, res, () => {});
  });
}

describe("Frame Ingestion API Tests", () => {
  let db: Database.Database;
  let app: Express;

  before(() => {
    // Create test database
    db = createDatabase(TEST_DB_PATH);

    // Create Express app with frames router
    app = express();
    app.use(express.json());
    app.use("/api/frames", createFramesRouter(db, TEST_API_KEY));
  });

  after(() => {
    // Clean up test database
    db.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("POST /api/frames", () => {
    test("should create a valid Frame and return 201", async () => {
      const validFrame = {
        reference_point: "auth handshake timeout",
        summary_caption: "Fixed timeout in auth service",
        module_scope: ["services/auth", "lib/networking"],
        status_snapshot: {
          next_action: "Deploy to staging",
        },
        branch: "feature/auth-fix",
        jira: "TICKET-123",
      };

      // Make request using supertest-like approach
      const response = await new Promise<{ status: number; body: any }>((resolve) => {
        const req = {
          method: "POST",
          url: "/",
          body: validFrame,
          headers: {
            authorization: `Bearer ${TEST_API_KEY}`,
            "content-type": "application/json",
          },
        } as any;

        const res = {
          statusCode: 200,
          _body: null as any,
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(data: any) {
            this._body = data;
            resolve({
              status: this.statusCode,
              body: this._body,
            });
          },
        } as any;

        const router = createFramesRouter(db, TEST_API_KEY);
        router(req, res, () => {});
      });

      assert.strictEqual(response.status, 201);
      assert.ok(response.body.id);
      assert.strictEqual(response.body.status, "created");
    });

    test("should return 400 for missing required field (reference_point)", async () => {
      const invalidFrame = {
        summary_caption: "Missing reference point",
        module_scope: ["services/auth"],
        status_snapshot: {
          next_action: "Test",
        },
      };

      const response = await new Promise<{ status: number; body: any }>((resolve) => {
        const req = {
          method: "POST",
          url: "/",
          body: invalidFrame,
          headers: {
            authorization: `Bearer ${TEST_API_KEY}`,
            "content-type": "application/json",
          },
        } as any;

        const res = {
          statusCode: 200,
          _body: null as any,
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(data: any) {
            this._body = data;
            resolve({
              status: this.statusCode,
              body: this._body,
            });
          },
        } as any;

        const router = createFramesRouter(db, TEST_API_KEY);
        router(req, res, () => {});
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error, "VALIDATION_FAILED");
      assert.ok(response.body.message.includes("reference_point"));
    });

    test("should return 400 for missing required field (module_scope)", async () => {
      const invalidFrame = {
        reference_point: "test",
        summary_caption: "Missing module scope",
        status_snapshot: {
          next_action: "Test",
        },
      };

      const response = await new Promise<{ status: number; body: any }>((resolve) => {
        const req = {
          method: "POST",
          url: "/",
          body: invalidFrame,
          headers: {
            authorization: `Bearer ${TEST_API_KEY}`,
            "content-type": "application/json",
          },
        } as any;

        const res = {
          statusCode: 200,
          _body: null as any,
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(data: any) {
            this._body = data;
            resolve({
              status: this.statusCode,
              body: this._body,
            });
          },
        } as any;

        const router = createFramesRouter(db, TEST_API_KEY);
        router(req, res, () => {});
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error, "VALIDATION_FAILED");
      assert.ok(response.body.message.includes("module_scope"));
    });

    test("should return 409 for duplicate Frame (same content hash)", async () => {
      const frame = {
        reference_point: "duplicate test frame",
        summary_caption: "Testing duplicate detection",
        module_scope: ["services/test"],
        status_snapshot: {
          next_action: "Verify deduplication",
        },
      };

      // Create first frame
      const response1 = await new Promise<{ status: number; body: any }>((resolve) => {
        const req = {
          method: "POST",
          url: "/",
          body: frame,
          headers: {
            authorization: `Bearer ${TEST_API_KEY}`,
            "content-type": "application/json",
          },
        } as any;

        const res = {
          statusCode: 200,
          _body: null as any,
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(data: any) {
            this._body = data;
            resolve({
              status: this.statusCode,
              body: this._body,
            });
          },
        } as any;

        const router = createFramesRouter(db, TEST_API_KEY);
        router(req, res, () => {});
      });

      assert.strictEqual(response1.status, 201);

      // Try to create duplicate frame
      const response2 = await new Promise<{ status: number; body: any }>((resolve) => {
        const req = {
          method: "POST",
          url: "/",
          body: frame,
          headers: {
            authorization: `Bearer ${TEST_API_KEY}`,
            "content-type": "application/json",
          },
        } as any;

        const res = {
          statusCode: 200,
          _body: null as any,
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(data: any) {
            this._body = data;
            resolve({
              status: this.statusCode,
              body: this._body,
            });
          },
        } as any;

        const router = createFramesRouter(db, TEST_API_KEY);
        router(req, res, () => {});
      });

      assert.strictEqual(response2.status, 409);
      assert.strictEqual(response2.body.error, "CONFLICT");
      assert.ok(response2.body.existing_frame_id);
    });

    test("should return 401 for missing API key", async () => {
      const frame = {
        reference_point: "test",
        summary_caption: "test",
        module_scope: ["test"],
        status_snapshot: {
          next_action: "test",
        },
      };

      const response = await new Promise<{ status: number; body: any }>((resolve) => {
        const req = {
          method: "POST",
          url: "/",
          body: frame,
          headers: {
            "content-type": "application/json",
          },
        } as any;

        const res = {
          statusCode: 200,
          _body: null as any,
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(data: any) {
            this._body = data;
            resolve({
              status: this.statusCode,
              body: this._body,
            });
          },
        } as any;

        const router = createFramesRouter(db, TEST_API_KEY);
        router(req, res, () => {});
      });

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.body.error, "UNAUTHORIZED");
    });

    test("should return 401 for invalid API key", async () => {
      const frame = {
        reference_point: "test",
        summary_caption: "test",
        module_scope: ["test"],
        status_snapshot: {
          next_action: "test",
        },
      };

      const response = await new Promise<{ status: number; body: any }>((resolve) => {
        const req = {
          method: "POST",
          url: "/",
          body: frame,
          headers: {
            authorization: "Bearer invalid-key",
            "content-type": "application/json",
          },
        } as any;

        const res = {
          statusCode: 200,
          _body: null as any,
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(data: any) {
            this._body = data;
            resolve({
              status: this.statusCode,
              body: this._body,
            });
          },
        } as any;

        const router = createFramesRouter(db, TEST_API_KEY);
        router(req, res, () => {});
      });

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.body.error, "UNAUTHORIZED");
    });
  });
});
