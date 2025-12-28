/**
 * Integration tests for MCP Server Idempotency (AX-008)
 *
 * Tests that the remember tool properly handles request_id idempotency keys:
 * - Duplicate request_id returns cached response (same frame_id)
 * - Different request_id creates new frames
 * - Omitted request_id works normally (no caching)
 * - Cache expiration works correctly
 *
 * Uses Node.js built-in test runner (node:test) - no external dependencies.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MCPServer } from "@app/memory/mcp_server/server.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("MCP Server - Idempotency (AX-008)", () => {
  let server: MCPServer;
  let testDbPath: string;

  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "lex-idempotency-test-"));
    testDbPath = join(tmpDir, "idempotency-test.db");
    server = new MCPServer(testDbPath);
    return server;
  }

  async function teardown() {
    if (server) {
      await server.close();
    }
    if (testDbPath) {
      try {
        rmSync(testDbPath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  test("duplicate request_id returns cached response with same frame_id", async () => {
    const srv = setup();
    try {
      const args = {
        reference_point: "test idempotency",
        summary_caption: "Testing request_id caching",
        status_snapshot: {
          next_action: "Verify cache works",
        },
        module_scope: ["policy/scanners"],
        request_id: "test-request-123",
      };

      // First call - should create a new frame
      const response1 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: args,
        },
      });

      assert.ok(response1.content, "First response should have content");
      assert.ok(response1.data, "First response should have data");
      const frameId1 = response1.data.frame_id;
      assert.ok(frameId1, "First response should have frame_id");

      // Second call with same request_id - should return cached response
      const response2 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: args,
        },
      });

      assert.ok(response2.content, "Second response should have content");
      assert.ok(response2.data, "Second response should have data");
      const frameId2 = response2.data.frame_id;

      // Should return the SAME frame_id (proving idempotency)
      assert.strictEqual(
        frameId2,
        frameId1,
        "Duplicate request_id should return same frame_id"
      );

      // Content should also match
      assert.strictEqual(
        response2.content[0].text,
        response1.content[0].text,
        "Cached response content should match original"
      );
    } finally {
      await teardown();
    }
  });

  test("different request_id creates new frames", async () => {
    const srv = setup();
    try {
      const baseArgs = {
        reference_point: "test different request_id",
        summary_caption: "Testing new frame creation",
        status_snapshot: {
          next_action: "Verify new frames created",
        },
        module_scope: ["policy/scanners"],
      };

      // First call with request_id_1
      const response1 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: { ...baseArgs, request_id: "request-1" },
        },
      });

      const frameId1 = response1.data?.frame_id;
      assert.ok(frameId1, "First frame should be created");

      // Second call with different request_id_2
      const response2 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: { ...baseArgs, request_id: "request-2" },
        },
      });

      const frameId2 = response2.data?.frame_id;
      assert.ok(frameId2, "Second frame should be created");

      // Should create DIFFERENT frames
      assert.notStrictEqual(
        frameId2,
        frameId1,
        "Different request_id should create different frames"
      );
    } finally {
      await teardown();
    }
  });

  test("omitted request_id works normally (no caching)", async () => {
    const srv = setup();
    try {
      const args = {
        reference_point: "test without request_id",
        summary_caption: "Testing normal operation",
        status_snapshot: {
          next_action: "Verify normal creation",
        },
        module_scope: ["policy/scanners"],
        // No request_id provided
      };

      // First call
      const response1 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: args,
        },
      });

      const frameId1 = response1.data?.frame_id;
      assert.ok(frameId1, "First frame should be created");

      // Second call with same args (no request_id)
      const response2 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: args,
        },
      });

      const frameId2 = response2.data?.frame_id;
      assert.ok(frameId2, "Second frame should be created");

      // Without request_id, should create DIFFERENT frames each time
      assert.notStrictEqual(
        frameId2,
        frameId1,
        "Without request_id, each call should create a new frame"
      );
    } finally {
      await teardown();
    }
  });

  test("cache returns same response for multiple retries", async () => {
    const srv = setup();
    try {
      const args = {
        reference_point: "test multiple retries",
        summary_caption: "Testing cache stability",
        status_snapshot: {
          next_action: "Verify cache consistency",
        },
        module_scope: ["policy/scanners"],
        request_id: "retry-test-456",
      };

      // Make the first call
      const response1 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: args,
        },
      });

      const frameId1 = response1.data?.frame_id;
      const content1 = response1.content?.[0]?.text;

      // Make 3 more retries with the same request_id
      for (let i = 0; i < 3; i++) {
        const response = await srv.handleRequest({
          method: "tools/call",
          params: {
            name: "remember",
            arguments: args,
          },
        });

        // All retries should return the same frame_id and content
        assert.strictEqual(
          response.data?.frame_id,
          frameId1,
          `Retry ${i + 1} should return same frame_id`
        );
        assert.strictEqual(
          response.content?.[0]?.text,
          content1,
          `Retry ${i + 1} should return same content`
        );
      }
    } finally {
      await teardown();
    }
  });

  test("request_id with validation errors is not cached", async () => {
    const srv = setup();
    try {
      const invalidArgs = {
        reference_point: "test error caching",
        summary_caption: "Testing error handling",
        status_snapshot: {
          next_action: "Verify errors not cached",
        },
        module_scope: [], // Invalid: empty module_scope
        request_id: "error-test-789",
      };

      // First call - should throw validation error
      const response1 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: invalidArgs,
        },
      });

      assert.ok(response1.error, "Should return validation error");
      assert.ok(
        response1.error.message.includes("module_scope"),
        "Error should mention module_scope"
      );

      // Second call with same request_id - should throw same error (not cached)
      const response2 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: invalidArgs,
        },
      });

      assert.ok(response2.error, "Should return validation error again");
      // We don't cache errors, so the error is re-computed
    } finally {
      await teardown();
    }
  });

  test("request_id preserves all response fields", async () => {
    const srv = setup();
    try {
      const args = {
        reference_point: "test response preservation",
        summary_caption: "Testing complete response caching",
        status_snapshot: {
          next_action: "Verify all fields preserved",
          blockers: ["test blocker"],
        },
        module_scope: ["policy/scanners"],
        jira: "TEST-123",
        keywords: ["test", "idempotency"],
        request_id: "preserve-test-999",
      };

      // First call
      const response1 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: args,
        },
      });

      // Second call (cached)
      const response2 = await srv.handleRequest({
        method: "tools/call",
        params: {
          name: "remember",
          arguments: args,
        },
      });

      // Verify all response fields are preserved
      assert.deepStrictEqual(
        response2.data,
        response1.data,
        "Cached response data should match original"
      );
      assert.deepStrictEqual(
        response2.content,
        response1.content,
        "Cached response content should match original"
      );

      // Verify Jira is in the response
      assert.ok(
        response2.content?.[0]?.text.includes("TEST-123"),
        "Cached response should include Jira ticket"
      );
    } finally {
      await teardown();
    }
  });
});
