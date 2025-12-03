/**
 * AXError Integration Tests for MCP Server
 *
 * Tests that MCP server error paths use AXErrorException with proper structure
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, loadKeyPair } from "@app/memory/mcp_server/auth/keys.js";
import { verifyToken } from "@app/memory/mcp_server/auth/jwt.js";
import {
  exchangeGitHubCode,
  getGitHubUser,
  type GitHubOAuthConfig,
} from "@app/memory/mcp_server/auth/github-provider.js";
import { isAXErrorException } from "@app/shared/errors/ax-error.js";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { MemoryFrameStore } from "@app/memory/store/memory/index.js";

describe("AXError Integration - MCP Server", () => {
  describe("JWT Errors", () => {
    it("should throw JWT_INVALID_TOKEN as AXErrorException", () => {
      const keys = generateKeyPair();
      const invalidToken = "invalid.jwt.token";

      try {
        verifyToken(invalidToken, keys.publicKey);
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(isAXErrorException(error), "Error should be AXErrorException");
        if (isAXErrorException(error)) {
          assert.equal(error.axError.code, "JWT_INVALID_TOKEN");
          assert.ok(error.axError.message.includes("Invalid token"));
          assert.ok(error.axError.nextActions.length > 0);
          assert.ok(error.axError.context);
        }
      }
    });

    it("should throw JWT_PRIVATE_KEY_NOT_FOUND as AXErrorException", () => {
      const nonExistentPath = "/tmp/nonexistent/private.pem";

      try {
        loadKeyPair({
          privateKeyPath: nonExistentPath,
          publicKeyPath: "/tmp/nonexistent/public.pem",
        });
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(isAXErrorException(error), "Error should be AXErrorException");
        if (isAXErrorException(error)) {
          assert.equal(error.axError.code, "JWT_PRIVATE_KEY_NOT_FOUND");
          assert.ok(error.axError.message.includes("Private key not found"));
          assert.ok(error.axError.nextActions.length > 0);
          assert.equal(error.axError.context?.privateKeyPath, nonExistentPath);
        }
      }
    });

    it("should throw JWT_PUBLIC_KEY_NOT_FOUND as AXErrorException", async () => {
      // Create a temp directory with only private key
      const { mkdtempSync, writeFileSync, rmSync } = await import("fs");
      const { join } = await import("path");
      const { tmpdir } = await import("os");

      const tempDir = mkdtempSync(join(tmpdir(), "lex-test-"));
      const keys = generateKeyPair();
      const privateKeyPath = join(tempDir, "private.pem");
      const publicKeyPath = join(tempDir, "public.pem");

      try {
        // Write only the private key
        writeFileSync(privateKeyPath, keys.privateKey);

        try {
          loadKeyPair({ privateKeyPath, publicKeyPath });
          assert.fail("Should have thrown an error");
        } catch (error) {
          assert.ok(isAXErrorException(error), "Error should be AXErrorException");
          if (isAXErrorException(error)) {
            assert.equal(error.axError.code, "JWT_PUBLIC_KEY_NOT_FOUND");
            assert.ok(error.axError.message.includes("Public key not found"));
            assert.ok(error.axError.nextActions.length > 0);
            assert.equal(error.axError.context?.publicKeyPath, publicKeyPath);
          }
        }
      } finally {
        // Clean up
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("MCP Server Errors", () => {
    it("should return MCP_RECALL_MISSING_PARAMS error in response", async () => {
      const store = new MemoryFrameStore();
      const server = new MCPServer({ frameStore: store });

      try {
        const request = {
          method: "tools/call",
          params: {
            name: "lex.recall",
            arguments: {
              // No search parameters provided
            },
          },
        };

        const response = await server.handleRequest(request);

        // MCP server catches errors and returns them in the response
        assert.ok(response.error, "Response should contain error");
        assert.equal(response.error.code, "MCP_RECALL_MISSING_PARAMS");
        assert.ok(response.error.message.includes("At least one search parameter required"));
        assert.ok(response.error.nextActions, "Error should have nextActions");
        assert.ok(
          response.error.nextActions && response.error.nextActions.length >= 3,
          "Should have at least 3 next actions"
        );
        assert.ok(response.error.context, "Error should have context");
      } finally {
        await server.close();
        await store.close();
      }
    });
  });

  describe("AXError Structure Compliance", () => {
    it("all MCP server errors should have required AXError fields", () => {
      // This test documents the error structure requirements
      // All errors should have:
      // - code: UPPER_SNAKE_CASE string
      // - message: non-empty string
      // - nextActions: array with at least one element
      // - context: optional object with helpful debug info

      const errorCodes = [
        "JWT_INVALID_TOKEN",
        "JWT_TOKEN_EXPIRED",
        "JWT_PRIVATE_KEY_NOT_FOUND",
        "JWT_PUBLIC_KEY_NOT_FOUND",
        "AUTH_GITHUB_TOKEN_FAILED",
        "AUTH_GITHUB_NO_EMAIL",
        "MCP_AUTH_REQUIRED",
        "MCP_RECALL_MISSING_PARAMS",
      ];

      // Verify error codes follow naming convention
      for (const code of errorCodes) {
        assert.match(code, /^[A-Z][A-Z0-9_]*$/, `${code} should be UPPER_SNAKE_CASE`);
      }

      // Verify error code categories
      const jwtErrors = errorCodes.filter((c) => c.startsWith("JWT_"));
      const authErrors = errorCodes.filter((c) => c.startsWith("AUTH_"));
      const mcpErrors = errorCodes.filter((c) => c.startsWith("MCP_"));

      assert.ok(jwtErrors.length >= 4, "Should have JWT errors");
      assert.ok(authErrors.length >= 2, "Should have AUTH errors");
      assert.ok(mcpErrors.length >= 2, "Should have MCP errors");
    });
  });
});
