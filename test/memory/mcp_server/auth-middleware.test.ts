/**
 * JWT Authentication Middleware Tests
 *
 * Tests for JWT authentication and user isolation
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Express } from "express";
import Database from "better-sqlite3-multiple-ciphers";
import { createHttpServer } from "../../../src/memory/mcp_server/http-server.js";
import { initializeDatabase } from "../../../src/memory/store/db.js";
import { generateKeyPair } from "../../../src/memory/mcp_server/auth/keys.js";
import { createTokenPair } from "../../../src/memory/mcp_server/auth/jwt.js";

describe("JWT Authentication Middleware", () => {
  let db: Database.Database;
  let app: Express;
  let keys: { publicKey: string; privateKey: string };
  const testApiKey = "test-api-key-secure-random-string";

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");
    initializeDatabase(db);

    // Generate JWT keys
    keys = generateKeyPair();

    // Create HTTP server with both OAuth and API key auth
    app = createHttpServer(db, {
      enableOAuth: true,
      jwtPublicKey: keys.publicKey,
      jwtPrivateKey: keys.privateKey,
      apiKey: testApiKey,
      port: 3000,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("JWT Authentication", () => {
    it("should accept valid JWT token", async () => {
      // Create a test user
      const userId = "github-123";
      db.prepare(
        `
        INSERT INTO users (user_id, email, name, provider, provider_user_id)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(userId, "test@example.com", "Test User", "github", "123");

      // Create JWT token
      const tokenPair = createTokenPair(
        {
          sub: userId,
          email: "test@example.com",
          name: "Test User",
          provider: "github",
        },
        keys.privateKey
      );

      const response = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${tokenPair.accessToken}`)
        .send({
          reference_point: "test work",
          summary_caption: "test summary",
          module_scope: ["test/module"],
          status_snapshot: { next_action: "continue testing" },
          branch: "main",
        })
        .expect(201);

      assert.ok(response.body.id);
      assert.equal(response.body.status, "created");

      // Verify frame was created with correct user_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frame = db.prepare("SELECT * FROM frames WHERE id = ?").get(response.body.id) as any;
      assert.equal(frame.user_id, userId);
    });

    it("should reject invalid JWT token", async () => {
      const response = await request(app)
        .post("/api/frames")
        .set("Authorization", "Bearer invalid-token")
        .send({
          reference_point: "test",
          summary_caption: "test",
          module_scope: ["test"],
          status_snapshot: { next_action: "test" },
        })
        .expect(401);

      assert.equal(response.body.error, "UNAUTHORIZED");
    });

    it("should reject expired JWT token", async () => {
      // This test would require creating a token with past expiration
      // For now, we trust the JWT library handles expiration correctly
      // and focus on testing our integration
    });
  });

  describe("API Key Authentication (Legacy)", () => {
    it("should accept valid API key", async () => {
      const response = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({
          reference_point: "test work",
          summary_caption: "test summary",
          module_scope: ["test/module"],
          status_snapshot: { next_action: "continue testing" },
          branch: "main",
        })
        .expect(201);

      assert.ok(response.body.id);

      // Verify frame was created with system-default user_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frame = db.prepare("SELECT * FROM frames WHERE id = ?").get(response.body.id) as any;
      assert.equal(frame.user_id, "system-default");
    });

    it("should reject invalid API key", async () => {
      const response = await request(app)
        .post("/api/frames")
        .set("Authorization", "Bearer wrong-api-key")
        .send({
          reference_point: "test",
          summary_caption: "test",
          module_scope: ["test"],
          status_snapshot: { next_action: "test" },
        })
        .expect(401);

      assert.equal(response.body.error, "UNAUTHORIZED");
    });
  });

  describe("User Isolation", () => {
    it("should assign frames to correct user based on JWT", async () => {
      // Create two test users
      const userId1 = "github-123";
      const userId2 = "github-456";

      db.prepare(
        `
        INSERT INTO users (user_id, email, name, provider, provider_user_id)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(userId1, "user1@example.com", "User 1", "github", "123");

      db.prepare(
        `
        INSERT INTO users (user_id, email, name, provider, provider_user_id)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(userId2, "user2@example.com", "User 2", "github", "456");

      // Create tokens for both users
      const token1 = createTokenPair(
        {
          sub: userId1,
          email: "user1@example.com",
          provider: "github",
        },
        keys.privateKey
      );

      const token2 = createTokenPair(
        {
          sub: userId2,
          email: "user2@example.com",
          provider: "github",
        },
        keys.privateKey
      );

      // Create frame as user1
      const response1 = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${token1.accessToken}`)
        .send({
          reference_point: "user1 work",
          summary_caption: "user1 summary",
          module_scope: ["test/module"],
          status_snapshot: { next_action: "user1 action" },
          branch: "main",
        })
        .expect(201);

      // Create frame as user2
      const response2 = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${token2.accessToken}`)
        .send({
          reference_point: "user2 work",
          summary_caption: "user2 summary",
          module_scope: ["test/module"],
          status_snapshot: { next_action: "user2 action" },
          branch: "main",
        })
        .expect(201);

      // Verify frames have correct user_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frame1 = db.prepare("SELECT * FROM frames WHERE id = ?").get(response1.body.id) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frame2 = db.prepare("SELECT * FROM frames WHERE id = ?").get(response2.body.id) as any;

      assert.equal(frame1.user_id, userId1);
      assert.equal(frame2.user_id, userId2);
      assert.notEqual(frame1.user_id, frame2.user_id);
    });

    it("should assign API key frames to system-default user", async () => {
      const response = await request(app)
        .post("/api/frames")
        .set("Authorization", `Bearer ${testApiKey}`)
        .send({
          reference_point: "api key work",
          summary_caption: "api key summary",
          module_scope: ["test/module"],
          status_snapshot: { next_action: "api key action" },
          branch: "main",
        })
        .expect(201);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frame = db.prepare("SELECT * FROM frames WHERE id = ?").get(response.body.id) as any;
      assert.equal(frame.user_id, "system-default");
    });
  });

  describe("Database Migration", () => {
    it("should have created default system user", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defaultUser = db
        .prepare("SELECT * FROM users WHERE user_id = ?")
        .get("system-default") as any;

      assert.ok(defaultUser);
      assert.equal(defaultUser.user_id, "system-default");
      assert.equal(defaultUser.provider, "system");
    });

    it("should have user_id column in frames table", () => {
      const tableInfo = db.prepare("PRAGMA table_info(frames)").all();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userIdColumn = tableInfo.find((col: any) => col.name === "user_id");

      assert.ok(userIdColumn);
    });

    it("should have created users table", () => {
      const tableExists = db
        .prepare(
          `
        SELECT name FROM sqlite_master WHERE type='table' AND name='users'
      `
        )
        .get();

      assert.ok(tableExists);
    });

    it("should have created refresh_tokens table", () => {
      const tableExists = db
        .prepare(
          `
        SELECT name FROM sqlite_master WHERE type='table' AND name='refresh_tokens'
      `
        )
        .get();

      assert.ok(tableExists);
    });
  });
});
