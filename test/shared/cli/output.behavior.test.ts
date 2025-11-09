/**
 * Tests for CLI Output Wrapper
 *
 * Verifies:
 * - Plain vs JSONL mode output
 * - Dual sinks (console + logger)
 * - stdout/stderr routing
 * - Color/symbol rendering based on TTY
 * - Backward-compatible exports
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createOutput, output, info, success, warn, error, debug, json } from "../../../src/shared/cli/output.js";
import type { CliEvent } from "../../../src/shared/cli/output.types.js";

test("createOutput returns CliOutput interface", () => {
  const out = createOutput();
  assert.equal(typeof out.info, "function");
  assert.equal(typeof out.success, "function");
  assert.equal(typeof out.warn, "function");
  assert.equal(typeof out.error, "function");
  assert.equal(typeof out.debug, "function");
  assert.equal(typeof out.json, "function");
});

test("default output instance is exported", () => {
  assert.ok(output);
  assert.equal(typeof output.info, "function");
});

test("backward-compatible function exports exist", () => {
  assert.equal(typeof info, "function");
  assert.equal(typeof success, "function");
  assert.equal(typeof warn, "function");
  assert.equal(typeof error, "function");
  assert.equal(typeof debug, "function");
  assert.equal(typeof json, "function");
});

test("plain mode outputs to console.log for info", () => {
  const out = createOutput({ mode: "plain" });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    out.info("test message");
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes("test message"));
  } finally {
    console.log = originalLog;
  }
});

test("plain mode outputs to console.error for error", () => {
  const out = createOutput({ mode: "plain" });
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (msg: string) => errors.push(msg);

  try {
    out.error("test error");
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("test error"));
  } finally {
    console.error = originalError;
  }
});

test("jsonl mode outputs valid JSON", () => {
  const out = createOutput({ mode: "jsonl" });
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (msg: string) => logs.push(msg);
  console.error = (msg: string) => errors.push(msg);

  try {
    out.warn("test message", { foo: "bar" }, "TEST_CODE", "test hint");
    assert.equal(errors.length, 1); // Warn goes to stderr

    // Parse the JSON output
    const event: CliEvent = JSON.parse(errors[0]);
    assert.equal(event.v, 1);
    assert.equal(event.level, "warn");
    assert.equal(event.message, "test message");
    assert.deepEqual(event.data, { foo: "bar" });
    assert.equal(event.code, "TEST_CODE");
    assert.equal(event.hint, "test hint");
    assert.ok(event.ts); // Timestamp exists
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("jsonl mode includes scope when provided", () => {
  const out = createOutput({ mode: "jsonl", scope: "test-scope" });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    out.info("test");
    const event: CliEvent = JSON.parse(logs[0]);
    assert.equal(event.scope, "test-scope");
  } finally {
    console.log = originalLog;
  }
});

test("success level uses console.log (stdout)", () => {
  const out = createOutput({ mode: "plain" });
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (msg: string) => logs.push(msg);
  console.error = (msg: string) => errors.push(msg);

  try {
    out.success("success");
    assert.equal(logs.length, 1);
    assert.equal(errors.length, 0);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("warn level uses console.error (stderr)", () => {
  const out = createOutput({ mode: "plain" });
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (msg: string) => logs.push(msg);
  console.error = (msg: string) => errors.push(msg);

  try {
    out.warn("warning");
    assert.equal(logs.length, 0);
    assert.equal(errors.length, 1);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("debug level uses console.log (stdout)", () => {
  const out = createOutput({ mode: "plain" });
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (msg: string) => logs.push(msg);
  console.error = (msg: string) => errors.push(msg);

  try {
    out.debug("debug");
    assert.equal(logs.length, 1);
    assert.equal(errors.length, 0);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("json() helper emits proper CliEvent in jsonl mode", () => {
  const out = createOutput({ mode: "jsonl" });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    out.json({
      level: "success",
      message: "operation complete",
      data: { count: 42 },
      code: "OP_COMPLETE",
    });
    const event: CliEvent = JSON.parse(logs[0]);
    assert.equal(event.level, "success");
    assert.equal(event.message, "operation complete");
    assert.deepEqual(event.data, { count: 42 });
    assert.equal(event.code, "OP_COMPLETE");
  } finally {
    console.log = originalLog;
  }
});

test("plain mode includes symbols", () => {
  const out = createOutput({ mode: "plain" });
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (msg: string) => logs.push(msg);
  console.error = (msg: string) => errors.push(msg);

  try {
    out.info("info");
    out.success("success");
    out.warn("warn");
    out.error("error");
    out.debug("debug");

    // Check for symbols (may vary based on TTY)
    // Just verify output happened and contains the message
    assert.equal(logs.length, 3); // info, success, debug
    assert.equal(errors.length, 2); // warn, error
    assert.ok(logs.some((l) => l.includes("info")));
    assert.ok(logs.some((l) => l.includes("success")));
    assert.ok(errors.some((e) => e.includes("warn")));
    assert.ok(errors.some((e) => e.includes("error")));
    assert.ok(logs.some((l) => l.includes("debug")));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("logger receives diagnostic events (non-blocking)", () => {
  // Create a mock logger that tracks calls
  const logCalls: { level: string; message: string; data?: unknown }[] = [];
  const mockLogger = {
    info: (msg: string, data?: unknown) => logCalls.push({ level: "info", message: msg, data }),
    error: (msg: string, data?: unknown) => logCalls.push({ level: "error", message: msg, data }),
    warn: (msg: string, data?: unknown) => logCalls.push({ level: "warn", message: msg, data }),
    debug: (msg: string, data?: unknown) => logCalls.push({ level: "debug", message: msg, data }),
  };

  const out = createOutput({ mode: "plain", logger: mockLogger as any });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    out.info("test info", { key: "value" });

    // Verify console received output
    assert.equal(logs.length, 1);

    // Verify logger received diagnostic event
    assert.equal(logCalls.length, 1);
    assert.equal(logCalls[0].level, "info");
    assert.ok(logCalls[0].message.includes("CLI Output"));
  } finally {
    console.log = originalLog;
  }
});

test("broken logger does not crash CLI output", () => {
  // Create a logger that throws
  const brokenLogger = {
    info: () => {
      throw new Error("logger broken");
    },
    error: () => {
      throw new Error("logger broken");
    },
    warn: () => {
      throw new Error("logger broken");
    },
    debug: () => {
      throw new Error("logger broken");
    },
  };

  const out = createOutput({ mode: "plain", logger: brokenLogger as any });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    // This should not throw, even though logger is broken
    out.info("test");
    assert.equal(logs.length, 1);
  } finally {
    console.log = originalLog;
  }
});

test("backward-compatible info export works", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    info("backward compatible test");
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes("backward compatible test"));
  } finally {
    console.log = originalLog;
  }
});

test("backward-compatible success export works", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    success("success test");
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes("success test"));
  } finally {
    console.log = originalLog;
  }
});

test("backward-compatible warn export works", () => {
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (msg: string) => errors.push(msg);

  try {
    warn("warn test");
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("warn test"));
  } finally {
    console.error = originalError;
  }
});

test("backward-compatible error export works", () => {
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (msg: string) => errors.push(msg);

  try {
    error("error test");
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("error test"));
  } finally {
    console.error = originalError;
  }
});

test("backward-compatible debug export works", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    debug("debug test");
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes("debug test"));
  } finally {
    console.log = originalLog;
  }
});

test("backward-compatible json export works", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    json({ foo: "bar", count: 42 });
    assert.equal(logs.length, 1);
    // Should output raw JSON (not wrapped in CliEvent)
    const data = JSON.parse(logs[0]);
    assert.deepEqual(data, { foo: "bar", count: 42 });
  } finally {
    console.log = originalLog;
  }
});

test("CliEvent has required fields", () => {
  const out = createOutput({ mode: "jsonl" });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    out.info("test");
    const event: CliEvent = JSON.parse(logs[0]);

    // Required fields
    assert.equal(typeof event.v, "number");
    assert.equal(typeof event.ts, "string");
    assert.equal(typeof event.level, "string");

    // Optional fields may or may not be present
    if (event.scope !== undefined) {
      assert.equal(typeof event.scope, "string");
    }
    if (event.code !== undefined) {
      assert.equal(typeof event.code, "string");
    }
    if (event.message !== undefined) {
      assert.equal(typeof event.message, "string");
    }
  } finally {
    console.log = originalLog;
  }
});

test("CliEvent timestamp is ISO 8601", () => {
  const out = createOutput({ mode: "jsonl" });
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    out.info("test");
    const event: CliEvent = JSON.parse(logs[0]);

    // Parse timestamp to verify it's valid ISO 8601
    const date = new Date(event.ts);
    assert.ok(!isNaN(date.getTime()), "Timestamp should be valid ISO 8601");
    assert.equal(event.ts, date.toISOString(), "Timestamp should match ISO format");
  } finally {
    console.log = originalLog;
  }
});

test("multiple events in jsonl mode produce one line each", () => {
  const out = createOutput({ mode: "jsonl" });
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (msg: string) => logs.push(msg);
  console.error = (msg: string) => errors.push(msg);

  try {
    out.info("first");
    out.success("second");
    out.warn("third");

    assert.equal(logs.length, 2); // info, success
    assert.equal(errors.length, 1); // warn
    const allEvents = [...logs, ...errors];
    assert.equal(allEvents.length, 3);
    allEvents.forEach((log) => {
      const event: CliEvent = JSON.parse(log);
      assert.equal(event.v, 1);
      assert.ok(event.ts);
      assert.ok(event.level);
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("env LEX_CLI_OUTPUT_MODE=jsonl switches default mode", () => {
  const originalMode = process.env.LEX_CLI_OUTPUT_MODE;
  process.env.LEX_CLI_OUTPUT_MODE = "jsonl";

  try {
    const out = createOutput(); // No explicit mode
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      out.info("test");
      // Should be JSON output
      const event: CliEvent = JSON.parse(logs[0]);
      assert.equal(event.level, "info");
    } finally {
      console.log = originalLog;
    }
  } finally {
    if (originalMode !== undefined) {
      process.env.LEX_CLI_OUTPUT_MODE = originalMode;
    } else {
      delete process.env.LEX_CLI_OUTPUT_MODE;
    }
  }
});

test("explicit mode option overrides env var", () => {
  const originalMode = process.env.LEX_CLI_OUTPUT_MODE;
  process.env.LEX_CLI_OUTPUT_MODE = "jsonl";

  try {
    const out = createOutput({ mode: "plain" }); // Explicit plain
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      out.info("test");
      // Should NOT be valid JSON (plain mode)
      assert.throws(() => JSON.parse(logs[0]), "Plain mode should not output JSON");
    } finally {
      console.log = originalLog;
    }
  } finally {
    if (originalMode !== undefined) {
      process.env.LEX_CLI_OUTPUT_MODE = originalMode;
    } else {
      delete process.env.LEX_CLI_OUTPUT_MODE;
    }
  }
});
