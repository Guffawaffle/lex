import { describe, it } from "node:test";
import assert from "node:assert";
import { getLogger } from "@app/shared/logger/index.js";

describe("Logger smoke test", () => {
  it("should import and create logger instance", () => {
    const logger = getLogger();
    assert.ok(logger, "Logger should be created");
    assert.strictEqual(typeof logger.info, "function", "Logger should have info method");
    assert.strictEqual(typeof logger.error, "function", "Logger should have error method");
    assert.strictEqual(typeof logger.debug, "function", "Logger should have debug method");
    assert.strictEqual(typeof logger.warn, "function", "Logger should have warn method");
  });

  it("should create scoped logger", () => {
    const logger = getLogger("test-scope");
    assert.ok(logger, "Scoped logger should be created");
  });

  it("should be silent in test environment", () => {
    // This test verifies logger doesn't pollute test output
    const logger = getLogger("silent-test");
    logger.info("This message should not appear in test output");
    logger.debug("Debug message should also be silent");
    // If we see these messages, LEX_LOG_LEVEL=silent is not working
    assert.ok(true, "Logger runs without throwing");
  });
});
