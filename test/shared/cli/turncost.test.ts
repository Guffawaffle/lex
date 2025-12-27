/**
 * Tests for turncost CLI command
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "node:child_process";
import { createDatabase } from "@app/memory/store/db.js";
import { saveFrame } from "@app/memory/store/index.js";
import type { Frame } from "@app/memory/frames/types.js";

describe("Turn Cost Command", () => {
  const testDir = join(tmpdir(), `lex-turncost-test-${Date.now()}`);
  const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

  function getTestEnv(dbPath: string): NodeJS.ProcessEnv {
    return {
      NODE_ENV: "test",
      LEX_LOG_LEVEL: "silent",
      LEX_DB_PATH: dbPath,
      PATH: process.env.PATH,
    };
  }

  function createTestDatabase(dbPath: string, frameCount: number = 0, withSpend: boolean = false): void {
    const db = createDatabase(dbPath);

    // Add test frames
    for (let i = 0; i < frameCount; i++) {
      const date = new Date();
      date.setHours(date.getHours() - i); // Spread frames over hours

      const testFrame: Frame = {
        id: `test-frame-${i}`,
        timestamp: date.toISOString(),
        branch: "main",
        module_scope: ["cli"],
        summary_caption: `Test frame ${i}`,
        reference_point: `test ${i}`,
        status_snapshot: {
          next_action: `Action ${i}`,
        },
      };

      // Add spend metadata if requested
      if (withSpend && i % 2 === 0) {
        testFrame.spend = {
          tokens_estimated: 1000 + i * 100,
          prompts: 2 + i,
        };
      }

      saveFrame(db, testFrame);
    }

    db.close();
  }

  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("should handle empty database gracefully", () => {
    const dbPath = join(testDir, "empty.db");
    createTestDatabase(dbPath, 0);

    const result = execFileSync(process.execPath, [lexBin, "turncost", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.turnCost.frames, 0);
    assert.strictEqual(output.turnCost.estimatedTokens, 0);
    assert.strictEqual(output.turnCost.prompts, 0);
    assert.strictEqual(output.turnCost.period, "24h");
  });

  test("should return metrics for database with frames", () => {
    const dbPath = join(testDir, "with-frames.db");
    createTestDatabase(dbPath, 10, false);

    const result = execFileSync(process.execPath, [lexBin, "turncost", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.turnCost.frames, 10);
    assert.strictEqual(output.turnCost.period, "24h");
  });

  test("should aggregate spend metadata when available", () => {
    const dbPath = join(testDir, "with-spend.db");
    createTestDatabase(dbPath, 10, true);

    const result = execFileSync(process.execPath, [lexBin, "turncost", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.turnCost.frames, 10);
    assert.ok(output.turnCost.estimatedTokens > 0, "Should have estimated tokens");
    assert.ok(output.turnCost.prompts > 0, "Should have prompts count");
  });

  test("should support custom time periods", () => {
    const dbPath = join(testDir, "period.db");
    createTestDatabase(dbPath, 48, false); // 48 frames over 48 hours

    // Test 7 day period (should include all 48 frames)
    const result7d = execFileSync(process.execPath, [lexBin, "turncost", "--json", "--period", "7d"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output7d = JSON.parse(result7d);
    assert.strictEqual(output7d.success, true);
    assert.strictEqual(output7d.turnCost.frames, 48);
    assert.strictEqual(output7d.turnCost.period, "7d");
  });

  test("should filter by time period correctly", () => {
    const dbPath = join(testDir, "time-filter.db");
    
    // Create database with frames over 72 hours
    const db = createDatabase(dbPath);
    for (let i = 0; i < 72; i++) {
      const date = new Date();
      date.setHours(date.getHours() - i);
      
      const frame: Frame = {
        id: `frame-${i}`,
        timestamp: date.toISOString(),
        branch: "main",
        module_scope: ["test"],
        summary_caption: `Frame ${i}`,
        reference_point: `ref ${i}`,
        status_snapshot: { next_action: "test" },
      };
      saveFrame(db, frame);
    }
    db.close();

    // Test 24h period - should get approximately 24 frames
    const result24h = execFileSync(process.execPath, [lexBin, "turncost", "--json", "--period", "24h"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });
    const output24h = JSON.parse(result24h);
    assert.ok(output24h.turnCost.frames >= 23 && output24h.turnCost.frames <= 25, 
      `Expected ~24 frames for 24h period, got ${output24h.turnCost.frames}`);

    // Test 48h period - should get approximately 48 frames
    const result48h = execFileSync(process.execPath, [lexBin, "turncost", "--json", "--period", "48h"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });
    const output48h = JSON.parse(result48h);
    assert.ok(output48h.turnCost.frames >= 47 && output48h.turnCost.frames <= 49,
      `Expected ~48 frames for 48h period, got ${output48h.turnCost.frames}`);
  });

  test("should output valid JSON with --json flag", () => {
    const dbPath = join(testDir, "json-output.db");
    createTestDatabase(dbPath, 5, true);

    const result = execFileSync(process.execPath, [lexBin, "turncost", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    // Should parse without errors
    const output = JSON.parse(result);
    assert.strictEqual(output.success, true);
    assert.ok(output.turnCost);
    assert.ok(typeof output.turnCost.frames === "number");
    assert.ok(typeof output.turnCost.estimatedTokens === "number");
    assert.ok(typeof output.turnCost.prompts === "number");
    assert.ok(typeof output.turnCost.period === "string");
    assert.ok(output.metadata);
    assert.ok(output.metadata.since);
  });

  test("should show human-readable output without --json", () => {
    const dbPath = join(testDir, "human-readable.db");
    createTestDatabase(dbPath, 5, true);

    const result = execFileSync(process.execPath, [lexBin, "turncost"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    assert.ok(result.includes("Turn Cost Metrics"));
    assert.ok(result.includes("Period:"));
    assert.ok(result.includes("Frames:"));
    assert.ok(result.includes("Estimated Tokens:"));
    assert.ok(result.includes("Prompts:"));
  });

  test("should handle invalid period format", () => {
    const dbPath = join(testDir, "invalid-period.db");
    createTestDatabase(dbPath, 5);

    try {
      execFileSync(process.execPath, [lexBin, "turncost", "--json", "--period", "invalid"], {
        env: getTestEnv(dbPath),
        encoding: "utf-8",
      });
      assert.fail("Should have thrown an error");
    } catch (error: unknown) {
      // Expected to fail
      assert.ok(error);
    }
  });

  test("should calculate metrics for 7 day period", () => {
    const dbPath = join(testDir, "7days.db");
    
    // Create frames spread over 10 days
    const db = createDatabase(dbPath);
    for (let i = 0; i < 10; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      const frame: Frame = {
        id: `frame-${i}`,
        timestamp: date.toISOString(),
        branch: "main",
        module_scope: ["test"],
        summary_caption: `Frame ${i}`,
        reference_point: `ref ${i}`,
        status_snapshot: { next_action: "test" },
      };
      saveFrame(db, frame);
    }
    db.close();

    const result = execFileSync(process.execPath, [lexBin, "turncost", "--json", "--period", "7d"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.strictEqual(output.success, true);
    // Should include frames from last 7 days (days 0-6, so 7 frames)
    assert.ok(output.turnCost.frames >= 7 && output.turnCost.frames <= 8,
      `Expected 7-8 frames for 7d period, got ${output.turnCost.frames}`);
  });

  test("should handle database with no spend data", () => {
    const dbPath = join(testDir, "no-spend.db");
    createTestDatabase(dbPath, 5, false);

    const result = execFileSync(process.execPath, [lexBin, "turncost", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.turnCost.frames, 5);
    assert.strictEqual(output.turnCost.estimatedTokens, 0);
    assert.strictEqual(output.turnCost.prompts, 0);
  });
});
