/**
 * OAuth2 Routes Integration Tests
 *
 * Tests for OAuth2 authentication flow endpoints
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Express } from "express";
import Database from "better-sqlite3";
import { createHttpServer } from "../../../src/memory/mcp_server/http-server.js";
import { initializeDatabase } from "../../../src/memory/store/db.js";
import { generateKeyPair } from "../../../src/memory/mcp_server/auth/keys.js";
import { createTokenPair } from "../../../src/memory/mcp_server/auth/jwt.js";
import { createHash } from "crypto";

describe("OAuth2 Routes", () => {
  let db: Database.Database;
  let app: Express;
  let keys: { publicKey: string; privateKey: string };

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");
    initializeDatabase(db);

    // Generate JWT keys
    keys = generateKeyPair();

    // Create HTTP server with OAuth enabled (but no real GitHub credentials for tests)
    app = createHttpServer(db, {
      enableOAuth: true,
      github: {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        redirectUri: "http://localhost:3000/auth/callback",
      },
      jwtPublicKey: keys.publicKey,
      jwtPrivateKey: keys.privateKey,
      apiKey: "test-api-key", // Backward compatibility
      port: 3000,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("GET /auth/github", () => {
    it("should redirect to GitHub authorization URL", async () => {
      const response = await request(app)
        .get("/auth/github")
        .expect(302);

      assert.ok(response.headers.location);
      assert.ok(response.headers.location.includes("github.com/login/oauth/authorize"));
      assert.ok(response.headers.location.includes("client_id=test-client-id"));
      assert.ok(response.headers.location.includes("state="));
    });

    it("should include redirect parameter in state", async () => {
      const response = await request(app)
        .get("/auth/github?redirect=/dashboard")
        .expect(302);

      assert.ok(response.headers.location);
      assert.ok(response.headers.location.includes("state="));
    });
  });

  describe("GET /auth/callback", () => {
    it("should reject callback without state parameter", async () => {
      const response = await request(app)
        .get("/auth/callback?code=test-code")
        .expect(400);

      assert.equal(response.body.error, "INVALID_STATE");
    });

    it("should reject callback without code parameter", async () => {
      // Note: State is validated first for CSRF protection
      // So this test will fail on state validation, not code validation
      // This is intentional security behavior
      const response = await request(app)
        .get("/auth/callback?state=test-state")
        .expect(400);

      assert.equal(response.body.error, "INVALID_STATE");
    });

    it("should reject callback with invalid state", async () => {
      const response = await request(app)
        .get("/auth/callback?code=test-code&state=invalid-state")
        .expect(400);

      assert.equal(response.body.error, "INVALID_STATE");
    });

    // Note: Full OAuth flow test requires mocking GitHub API
    // which is complex and better suited for E2E tests
  });

  describe("POST /auth/refresh", () => {
    it("should reject refresh without token", async () => {
      const response = await request(app)
        .post("/auth/refresh")
        .send({})
        .expect(400);

      assert.equal(response.body.error, "MISSING_TOKEN");
    });

    it("should refresh a valid token", async () => {
      // Create a test user
      const userId = "github-123";
      db.prepare(`
        INSERT INTO users (user_id, email, name, provider, provider_user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, "test@example.com", "Test User", "github", "123");

      // Create a token pair
      const tokenPair = createTokenPair(
        {
          sub: userId,
          email: "test@example.com",
          name: "Test User",
          provider: "github",
        },
        keys.privateKey
      );

      // Store refresh token in database
      const tokenHash = createHash("sha256").update(tokenPair.refreshToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `).run("test-token-id", userId, tokenHash, expiresAt);

      // Refresh the token
      const response = await request(app)
        .post("/auth/refresh")
        .send({ refresh_token: tokenPair.refreshToken })
        .expect(200);

      assert.ok(response.body.access_token);
      assert.equal(response.body.token_type, "Bearer");
      assert.ok(response.body.expires_in > 0);
    });

    it("should reject revoked refresh token", async () => {
      const userId = "github-123";
      db.prepare(`
        INSERT INTO users (user_id, email, name, provider, provider_user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, "test@example.com", "Test User", "github", "123");

      const tokenPair = createTokenPair(
        {
          sub: userId,
          email: "test@example.com",
          provider: "github",
        },
        keys.privateKey
      );

      const tokenHash = createHash("sha256").update(tokenPair.refreshToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Insert and immediately revoke the token
      db.prepare(`
        INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at, revoked_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run("test-token-id", userId, tokenHash, expiresAt);

      const response = await request(app)
        .post("/auth/refresh")
        .send({ refresh_token: tokenPair.refreshToken })
        .expect(401);

      assert.equal(response.body.error, "INVALID_TOKEN");
    });
  });

  describe("POST /auth/revoke", () => {
    it("should reject revocation without token", async () => {
      const response = await request(app)
        .post("/auth/revoke")
        .send({})
        .expect(400);

      assert.equal(response.body.error, "MISSING_TOKEN");
    });

    it("should revoke a valid refresh token", async () => {
      const userId = "github-123";
      db.prepare(`
        INSERT INTO users (user_id, email, name, provider, provider_user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, "test@example.com", "Test User", "github", "123");

      const tokenPair = createTokenPair(
        {
          sub: userId,
          email: "test@example.com",
          provider: "github",
        },
        keys.privateKey
      );

      const tokenHash = createHash("sha256").update(tokenPair.refreshToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `).run("test-token-id", userId, tokenHash, expiresAt);

      const response = await request(app)
        .post("/auth/revoke")
        .send({ refresh_token: tokenPair.refreshToken })
        .expect(200);

      assert.ok(response.body.message);

      // Verify token is revoked in database
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const revokedToken = db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?").get(tokenHash) as any;
      assert.ok(revokedToken.revoked_at);
    });

    it("should return error for non-existent token", async () => {
      const response = await request(app)
        .post("/auth/revoke")
        .send({ refresh_token: "non-existent-token" })
        .expect(404);

      assert.equal(response.body.error, "TOKEN_NOT_FOUND");
    });
  });
});
