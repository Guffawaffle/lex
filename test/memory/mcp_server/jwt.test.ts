/**
 * JWT Token Management Tests
 *
 * Tests for JWT signing, verification, and token utilities
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair } from "../../../src/memory/mcp_server/auth/keys.js";
import {
  signAccessToken,
  signRefreshToken,
  createTokenPair,
  verifyToken,
  decodeToken,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
  TOKEN_EXPIRATION,
  type JwtPayload,
} from "../../../src/memory/mcp_server/auth/jwt.js";

describe("JWT Token Management", () => {
  let keys: { publicKey: string; privateKey: string };

  beforeEach(() => {
    // Generate a fresh key pair for each test
    keys = generateKeyPair();
  });

  describe("Token Signing", () => {
    it("should sign an access token with RS256", () => {
      const payload: JwtPayload = {
        sub: "user-123",
        email: "test@example.com",
        name: "Test User",
        provider: "github",
      };

      const token = signAccessToken(payload, keys.privateKey);

      assert.ok(token);
      assert.equal(typeof token, "string");
      assert.ok(token.split(".").length === 3); // JWT has 3 parts
    });

    it("should sign a refresh token", () => {
      const userId = "user-123";
      const token = signRefreshToken(userId, keys.privateKey);

      assert.ok(token);
      assert.equal(typeof token, "string");
      assert.ok(token.split(".").length === 3);
    });

    it("should create a token pair", () => {
      const payload: JwtPayload = {
        sub: "user-123",
        email: "test@example.com",
        provider: "github",
      };

      const tokenPair = createTokenPair(payload, keys.privateKey);

      assert.ok(tokenPair.accessToken);
      assert.ok(tokenPair.refreshToken);
      assert.equal(tokenPair.expiresIn, TOKEN_EXPIRATION.ACCESS_TOKEN);
    });
  });

  describe("Token Verification", () => {
    it("should verify a valid access token", () => {
      const payload: JwtPayload = {
        sub: "user-123",
        email: "test@example.com",
        name: "Test User",
        provider: "github",
      };

      const token = signAccessToken(payload, keys.privateKey);
      const decoded = verifyToken(token, keys.publicKey);

      assert.equal(decoded.sub, payload.sub);
      assert.equal(decoded.email, payload.email);
      assert.equal(decoded.name, payload.name);
      assert.equal(decoded.provider, payload.provider);
    });

    it("should reject a token signed with different key", () => {
      const payload: JwtPayload = {
        sub: "user-123",
        email: "test@example.com",
        provider: "github",
      };

      const token = signAccessToken(payload, keys.privateKey);
      const wrongKeys = generateKeyPair();

      assert.throws(() => verifyToken(token, wrongKeys.publicKey), {
        message: /Invalid token/,
      });
    });

    it("should reject a malformed token", () => {
      assert.throws(() => verifyToken("not-a-valid-token", keys.publicKey), {
        message: /Invalid token/,
      });
    });

    it("should decode a token without verification", () => {
      const payload: JwtPayload = {
        sub: "user-123",
        email: "test@example.com",
        provider: "github",
      };

      const token = signAccessToken(payload, keys.privateKey);
      const decoded = decodeToken(token);

      assert.ok(decoded);
      assert.equal(decoded!.sub, payload.sub);
      assert.equal(decoded!.email, payload.email);
    });

    it("should return null for invalid token when decoding", () => {
      const decoded = decodeToken("not-a-valid-token");
      assert.equal(decoded, null);
    });
  });

  describe("CSRF Protection", () => {
    it("should generate a random state parameter", () => {
      const state1 = generateState();
      const state2 = generateState();

      assert.ok(state1);
      assert.ok(state2);
      assert.equal(typeof state1, "string");
      assert.equal(state1.length, 64); // 32 bytes = 64 hex chars
      assert.notEqual(state1, state2); // Should be random
    });
  });

  describe("PKCE Support", () => {
    it("should generate a code verifier", () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();

      assert.ok(verifier1);
      assert.ok(verifier2);
      assert.equal(typeof verifier1, "string");
      assert.notEqual(verifier1, verifier2); // Should be random
    });

    it("should generate a code challenge from verifier", () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      assert.ok(challenge);
      assert.equal(typeof challenge, "string");
      assert.notEqual(challenge, verifier); // Challenge should be different
    });

    it("should generate consistent challenge for same verifier", () => {
      const verifier = generateCodeVerifier();
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);

      assert.equal(challenge1, challenge2);
    });
  });

  describe("Token Expiration", () => {
    it("should include expiration in access token", () => {
      const payload: JwtPayload = {
        sub: "user-123",
        email: "test@example.com",
        provider: "github",
      };

      const token = signAccessToken(payload, keys.privateKey);
      const decoded = decodeToken(token);

      assert.ok(decoded);
      assert.ok(decoded!.exp);
      assert.ok(decoded!.iat);

      // Token should expire in about 1 hour
      const expectedExpiration = decoded!.iat! + TOKEN_EXPIRATION.ACCESS_TOKEN;
      assert.ok(Math.abs(decoded!.exp! - expectedExpiration) < 2); // Allow 2 second variance
    });

    it("should include expiration in refresh token", () => {
      const userId = "user-123";
      const token = signRefreshToken(userId, keys.privateKey);
      const decoded = decodeToken(token);

      assert.ok(decoded);
      assert.ok(decoded!.exp);
      assert.ok(decoded!.iat);

      // Token should expire in about 30 days
      const expectedExpiration = decoded!.iat! + TOKEN_EXPIRATION.REFRESH_TOKEN;
      assert.ok(Math.abs(decoded!.exp! - expectedExpiration) < 2);
    });
  });
});
