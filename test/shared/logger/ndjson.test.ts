/**
 * Tests for NDJSON logger
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { readFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getNDJSONLogger,
  writeLog,
  getLogDirectory,
  getLogFilePath,
  rotateLogIfNeeded,
} from "@app/shared/logger/ndjson.js";

describe("NDJSON Logger", () => {
  const originalWorkspaceRoot = process.env.LEX_WORKSPACE_ROOT;
  const testWorkspaceRoot = join(tmpdir(), `lex-ndjson-test-${Date.now()}`);

  before(() => {
    // Set up test workspace
    process.env.LEX_WORKSPACE_ROOT = testWorkspaceRoot;
    process.env.LEX_LOG_NDJSON = "1"; // Enable logging in test mode
    mkdirSync(testWorkspaceRoot, { recursive: true });
  });

  after(() => {
    // Restore original env
    if (originalWorkspaceRoot) {
      process.env.LEX_WORKSPACE_ROOT = originalWorkspaceRoot;
    } else {
      delete process.env.LEX_WORKSPACE_ROOT;
    }
    delete process.env.LEX_LOG_NDJSON;

    // Clean up test workspace
    try {
      const logFile = getLogFilePath();
      if (existsSync(logFile)) {
        unlinkSync(logFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should create log directory", () => {
    const logDir = getLogDirectory();
    assert.ok(existsSync(logDir), "Log directory should exist");
    assert.ok(
      logDir.includes(".smartergpt/lex/logs"),
      "Log directory should be in .smartergpt/lex/logs"
    );
  });

  test("should write NDJSON log entry", () => {
    const logPath = getLogFilePath();

    writeLog({
      timestamp: "2025-11-23T12:00:00.000Z",
      level: "info",
      message: "Test message",
      module: "test/module",
      operation: "testOp",
      duration_ms: 42,
      metadata: { key: "value" },
    });

    assert.ok(existsSync(logPath), "Log file should exist");

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    const entry = JSON.parse(lastLine);

    assert.strictEqual(entry.level, "info");
    assert.strictEqual(entry.message, "Test message");
    assert.strictEqual(entry.module, "test/module");
    assert.strictEqual(entry.operation, "testOp");
    assert.strictEqual(entry.duration_ms, 42);
    assert.deepStrictEqual(entry.metadata, { key: "value" });
  });

  test("should write log with error", () => {
    const error = new Error("Test error");

    writeLog({
      timestamp: "2025-11-23T12:00:00.000Z",
      level: "error",
      message: "Operation failed",
      module: "test/module",
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });

    const content = readFileSync(getLogFilePath(), "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    const entry = JSON.parse(lastLine);

    assert.strictEqual(entry.level, "error");
    assert.strictEqual(entry.message, "Operation failed");
    assert.ok(entry.error);
    assert.strictEqual(entry.error.name, "Error");
    assert.strictEqual(entry.error.message, "Test error");
  });

  test("should use NDJSONLogger class", () => {
    const logger = getNDJSONLogger("test/logger");

    logger.info("Info message", {
      operation: "testOperation",
      duration_ms: 10,
      metadata: { test: true },
    });

    const content = readFileSync(getLogFilePath(), "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    const entry = JSON.parse(lastLine);

    assert.strictEqual(entry.level, "info");
    assert.strictEqual(entry.message, "Info message");
    assert.strictEqual(entry.module, "test/logger");
    assert.strictEqual(entry.operation, "testOperation");
    assert.strictEqual(entry.duration_ms, 10);
    assert.deepStrictEqual(entry.metadata, { test: true });
  });

  test("should write different log levels", () => {
    const logger = getNDJSONLogger("test/levels");

    logger.trace("Trace message");
    logger.debug("Debug message");
    logger.info("Info message");
    logger.warn("Warn message");
    logger.error("Error message");
    logger.fatal("Fatal message");

    const content = readFileSync(getLogFilePath(), "utf-8");
    const lines = content.trim().split("\n");
    const lastSix = lines.slice(-6);

    const levels = lastSix.map((line) => JSON.parse(line).level);
    assert.deepStrictEqual(levels, ["trace", "debug", "info", "warn", "error", "fatal"]);
  });

  test("should handle log rotation", () => {
    // This is a basic test - full rotation testing would require creating large files
    // Just verify the function doesn't throw
    assert.doesNotThrow(() => {
      rotateLogIfNeeded(100 * 1024 * 1024); // 100MB threshold
    });
  });
});
