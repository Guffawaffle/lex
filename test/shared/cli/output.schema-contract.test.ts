/**
 * CLI Output Schema Contract Tests
 *
 * Validates that CLI JSON output conforms to cli-output.v1.schema.json.
 * This is part of the Lex 1.0.0 contract - orchestrators can rely on this schema.
 *
 * @see schemas/cli-output.v1.schema.json
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createOutput } from "../../../src/shared/cli/output.js";
import type { CliEvent } from "../../../src/shared/cli/output.types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the schema
const schemaPath = join(__dirname, "../../../schemas/cli-output.v1.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

// Set up AJV validator
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

/**
 * Helper to capture JSON output from CLI
 */
function captureJsonOutput(fn: (out: ReturnType<typeof createOutput>) => void): CliEvent[] {
  const captured: CliEvent[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (msg: string) => {
    try {
      captured.push(JSON.parse(msg));
    } catch {
      // Ignore non-JSON output
    }
  };
  console.error = (msg: string) => {
    try {
      captured.push(JSON.parse(msg));
    } catch {
      // Ignore non-JSON output
    }
  };

  try {
    const out = createOutput({ mode: "jsonl", scope: "test" });
    fn(out);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return captured;
}

describe("CLI Output Schema Contract", () => {
  test("schema is valid JSON Schema", () => {
    assert.ok(schema.$schema);
    assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#");
    assert.ok(schema.title);
    assert.ok(schema.properties);
  });

  test("info output conforms to schema", () => {
    const events = captureJsonOutput((out) => {
      out.info("Test info message");
    });

    assert.equal(events.length, 1);
    const valid = validate(events[0]);
    assert.ok(valid, `Schema validation failed: ${JSON.stringify(validate.errors)}`);
    assert.equal(events[0].level, "info");
    assert.equal(events[0].v, 1);
  });

  test("success output conforms to schema", () => {
    const events = captureJsonOutput((out) => {
      out.success("Test success message");
    });

    assert.equal(events.length, 1);
    const valid = validate(events[0]);
    assert.ok(valid, `Schema validation failed: ${JSON.stringify(validate.errors)}`);
    assert.equal(events[0].level, "success");
  });

  test("warn output conforms to schema", () => {
    const events = captureJsonOutput((out) => {
      out.warn("Test warning message");
    });

    assert.equal(events.length, 1);
    const valid = validate(events[0]);
    assert.ok(valid, `Schema validation failed: ${JSON.stringify(validate.errors)}`);
    assert.equal(events[0].level, "warn");
  });

  test("error output conforms to schema", () => {
    const events = captureJsonOutput((out) => {
      out.error("Test error message");
    });

    assert.equal(events.length, 1);
    const valid = validate(events[0]);
    assert.ok(valid, `Schema validation failed: ${JSON.stringify(validate.errors)}`);
    assert.equal(events[0].level, "error");
  });

  test("output with data payload conforms to schema", () => {
    const events = captureJsonOutput((out) => {
      out.info("Test with data", { id: "frame-123", count: 5 });
    });

    assert.equal(events.length, 1);
    const valid = validate(events[0]);
    assert.ok(valid, `Schema validation failed: ${JSON.stringify(validate.errors)}`);
    assert.deepEqual(events[0].data, { id: "frame-123", count: 5 });
  });

  test("output with code conforms to schema", () => {
    const events = captureJsonOutput((out) => {
      out.success("Frame saved", { id: "123" }, "MEM_WRITE_OK");
    });

    assert.equal(events.length, 1);
    const valid = validate(events[0]);
    assert.ok(valid, `Schema validation failed: ${JSON.stringify(validate.errors)}`);
    assert.equal(events[0].code, "MEM_WRITE_OK");
  });

  test("output with hint conforms to schema", () => {
    const events = captureJsonOutput((out) => {
      // Note: hints are only supported on warn and error
      out.warn("Operation needs attention", undefined, undefined, "Use --verbose for details");
    });

    assert.equal(events.length, 1);
    const valid = validate(events[0]);
    assert.ok(valid, `Schema validation failed: ${JSON.stringify(validate.errors)}`);
    assert.equal(events[0].hint, "Use --verbose for details");
  });

  test("output includes required fields: v, ts, level", () => {
    const events = captureJsonOutput((out) => {
      out.info("Minimal output");
    });

    assert.equal(events.length, 1);
    const event = events[0];

    // Required fields
    assert.equal(event.v, 1, "Must have v=1");
    assert.ok(event.ts, "Must have timestamp");
    assert.ok(event.level, "Must have level");

    // Timestamp should be valid ISO 8601
    const ts = new Date(event.ts);
    assert.ok(!isNaN(ts.getTime()), "Timestamp must be valid ISO 8601");
  });

  test("scope is included when configured", () => {
    const events = captureJsonOutput((out) => {
      out.info("With scope");
    });

    assert.equal(events.length, 1);
    const valid = validate(events[0]);
    assert.ok(valid, `Schema validation failed: ${JSON.stringify(validate.errors)}`);
    assert.equal(events[0].scope, "test");
  });

  test("all level values are valid according to schema", () => {
    const validLevels = ["info", "warn", "error", "success", "debug"];

    for (const level of validLevels) {
      const event: CliEvent = {
        v: 1,
        ts: new Date().toISOString(),
        level: level as CliEvent["level"],
      };
      const valid = validate(event);
      assert.ok(valid, `Level '${level}' should be valid: ${JSON.stringify(validate.errors)}`);
    }
  });

  test("invalid level is rejected by schema", () => {
    const event = {
      v: 1,
      ts: new Date().toISOString(),
      level: "invalid-level",
    };
    const valid = validate(event);
    assert.ok(!valid, "Invalid level should be rejected");
  });

  test("schema rejects additionalProperties", () => {
    const event = {
      v: 1,
      ts: new Date().toISOString(),
      level: "info",
      unknownField: "should be rejected",
    };
    const valid = validate(event);
    assert.ok(!valid, "Unknown fields should be rejected by additionalProperties: false");
  });

  test("schema version is always 1 for v1 schema", () => {
    const eventWithWrongVersion = {
      v: 2, // Wrong version
      ts: new Date().toISOString(),
      level: "info",
    };
    const valid = validate(eventWithWrongVersion);
    assert.ok(!valid, "v must be exactly 1 for v1 schema");
  });
});
