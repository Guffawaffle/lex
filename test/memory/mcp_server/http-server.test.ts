/**
 * HTTP Server Security Tests
 *
 * Tests for authentication, rate limiting, and security hardening
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Express } from "express";
import Database from "better-sqlite3";
import { createHttpServer } from "../../../src/memory/mcp_server/http-server.js";
import { initializeDatabase } from "../../../src/memory/store/db.js";

describe("HTTP Server Security", () => {
  let db: Database.Database;
  let app: Express;
  const testApiKey = "test-api-key-secure-random-string";

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");
    initializeDatabase(db);

    // Create HTTP server with test API key
    app = createHttpServer(db, {
      apiKey: testApiKey,
      port: 3000,
      rateLimitWindowMs: 60000, // 1 minute for faster testing
      rateLimitMaxRequests: 10,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("Authentication", () => {
    it("should reject requests without Authorization header", async () => {
      const response = await request(app)
        .post("/api/frames")
        .send({
          reference_point: "test",
          summary_caption: "test",
          module_scope: ["test"],
          status_snapshot: { next_action: "test" },
        });

      assert.equal(response.status, 401);
      assert.equal(response.body.error, "UNAUTHORIZED");
      assert.equal(response.body.message, "Invalid or missing API key");
      assert.equal(response.body.code, 401);
    });

    it("should reject requests with invalid API key", async () => {
      const response = await request(app)
        .post("/api/frames")
        .set("Authorization", "Bearer wrong-api-key")
        .send({
          reference_point: "test",
          summary_caption: "test",
          module_scope: ["test"],
          status_snapshot: { next_action: "test" },
        });

      assert.equal(response.status, 401);
      assert.equal(response.body.error, "UNAUTHORIZED");
    });

    it("should accept requests with valid API key", async () => {
      const response = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({
          reference_point: "test work",
          summary_caption: "test summary",
          module_scope: ["test/module"],
          status_snapshot: { next_action: "continue testing" },
          branch: "main",
        });

      assert.equal(response.status, 201);
      assert.equal(response.body.status, "created");
      assert.ok(response.body.id);
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits on API endpoints", async () => {
      // Make requests up to the limit (10 requests in our test config)
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post("/api/frames")
            .set("Authorization", `Bearer ${testApiKey}`)
            .send({
              reference_point: `test-${i}`,
              summary_caption: `test-${i}`,
              module_scope: ["test"],
              status_snapshot: { next_action: `test-${i}` },
            })
        );
      }

      const responses = await Promise.all(requests);

      // All 10 should succeed
      responses.forEach((response) => {
        assert.ok([201, 409].includes(response.status)); // 201 created, 409 duplicate
      });

      // 11th request should be rate limited
      const rateLimitedResponse = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({
          reference_point: "test-11",
          summary_caption: "test-11",
          module_scope: ["test"],
          status_snapshot: { next_action: "test-11" },
        });

      assert.equal(rateLimitedResponse.status, 429);
      assert.equal(rateLimitedResponse.body.error, "RATE_LIMIT_EXCEEDED");
    });

    it("should not rate limit health check endpoint", async () => {
      // Make many health check requests
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(request(app).get("/health"));
      }

      const responses = await Promise.all(requests);

      // All should succeed (health check is not rate limited)
      responses.forEach((response) => {
        assert.equal(response.status, 200);
        assert.equal(response.body.status, "ok");
      });
    });
  });

  describe("Security Headers", () => {
    it("should include security headers in responses", async () => {
      const response = await request(app).get("/health");

      // Check for Helmet-added security headers
      assert.equal(response.headers["x-content-type-options"], "nosniff");
      assert.ok(response.headers["x-frame-options"]);
      assert.ok(response.headers["strict-transport-security"]);
    });

    it("should set Content-Security-Policy header", async () => {
      const response = await request(app).get("/health");

      assert.ok(response.headers["content-security-policy"]);
      assert.ok(response.headers["content-security-policy"].includes("default-src 'self'"));
    });
  });

  describe("Request Size Limits", () => {
    it("should reject requests larger than 1MB", async () => {
      // Create a payload larger than 1MB
      const largePayload = {
        reference_point: "test",
        summary_caption: "test",
        module_scope: ["test"],
        status_snapshot: { next_action: "test" },
        // Add a large string to exceed 1MB
        large_data: "x".repeat(2 * 1024 * 1024), // 2MB of 'x' characters
      };

      const response = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send(largePayload);

      assert.equal(response.status, 413); // Payload Too Large
    });
  });

  describe("Health Check", () => {
    it("should allow health checks without authentication", async () => {
      const response = await request(app).get("/health");

      assert.equal(response.status, 200);
      assert.equal(response.body.status, "ok");
      assert.ok(response.body.timestamp);
    });
  });

  describe("Input Validation", () => {
    it("should reject invalid frame data", async () => {
      const response = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({
          // Missing required fields
          reference_point: "test",
        });

      assert.equal(response.status, 400);
      assert.equal(response.body.error, "VALIDATION_FAILED");
    });
  });

  describe("Deduplication", () => {
    it("should detect and reject duplicate frames", async () => {
      const frameData = {
        reference_point: "unique-test",
        summary_caption: "unique summary",
        module_scope: ["test/module"],
        status_snapshot: { next_action: "continue" },
        branch: "main",
      };

      // First request should succeed
      const response1 = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send(frameData);

      assert.equal(response1.status, 201);

      // Second identical request should be detected as duplicate
      const response2 = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send(frameData);

      assert.equal(response2.status, 409); // Conflict
      assert.equal(response2.body.error, "CONFLICT");
      assert.ok(response2.body.message.includes("already exists"));
    });
  });
});
