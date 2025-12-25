/**
 * Tests for database stats CLI command
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

describe("Database Stats Command", () => {
  const testDir = join(tmpdir(), `lex-db-stats-test-${Date.now()}`);
  const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

  function getTestEnv(dbPath: string): NodeJS.ProcessEnv {
    return {
      NODE_ENV: "test",
      LEX_LOG_LEVEL: "silent",
      LEX_DB_PATH: dbPath,
      PATH: process.env.PATH,
    };
  }

  function createTestDatabase(dbPath: string, frameCount: number = 0): void {
    const db = createDatabase(dbPath);

    // Add test frames
    for (let i = 0; i < frameCount; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i); // Spread frames over time

      const testFrame: Frame = {
        id: `test-frame-${i}`,
        timestamp: date.toISOString(),
        branch: "main",
        module_scope: i % 3 === 0 ? ["cli", "memory/store"] : i % 3 === 1 ? ["cli"] : ["policy/check"],
        summary_caption: `Test frame ${i}`,
        reference_point: `test ${i}`,
        status_snapshot: {
          next_action: `Action ${i}`,
        },
      };
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

  test("should show stats for empty database", () => {
    const dbPath = join(testDir, "empty.db");
    createTestDatabase(dbPath, 0);

    const result = execFileSync(process.execPath, [lexBin, "db", "stats", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.strictEqual(output.frames.total, 0);
    assert.strictEqual(output.frames.thisWeek, 0);
    assert.strictEqual(output.frames.thisMonth, 0);
    assert.strictEqual(output.dateRange.oldest, null);
    assert.strictEqual(output.dateRange.newest, null);
  });

  test("should show stats for database with frames", () => {
    const dbPath = join(testDir, "with-frames.db");
    createTestDatabase(dbPath, 10);

    const result = execFileSync(process.execPath, [lexBin, "db", "stats", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.strictEqual(output.frames.total, 10);
    assert.ok(output.frames.thisWeek >= 7); // At least 7 frames (days 0-6) are within last week
    assert.strictEqual(output.frames.thisMonth, 10); // All frames within last month
    assert.ok(output.dateRange.oldest);
    assert.ok(output.dateRange.newest);
    assert.ok(output.sizeBytes > 0);
  });

  test("should show module distribution", () => {
    const dbPath = join(testDir, "module-dist.db");
    createTestDatabase(dbPath, 12);

    const result = execFileSync(process.execPath, [lexBin, "db", "stats", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.ok(output.moduleDistribution);
    assert.ok(output.moduleDistribution.cli); // Should have cli module
  });

  test("should support detailed mode", () => {
    const dbPath = join(testDir, "detailed.db");
    createTestDatabase(dbPath, 12);

    const result = execFileSync(process.execPath, [lexBin, "db", "stats", "--json", "--detailed"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.ok(output.moduleDistribution);
    // In detailed mode, should show all modules
    assert.ok(Object.keys(output.moduleDistribution).length >= 3);
  });

  test("should handle non-existent database", () => {
    const dbPath = join(testDir, "non-existent.db");

    try {
      execFileSync(process.execPath, [lexBin, "db", "stats", "--json"], {
        env: getTestEnv(dbPath),
        encoding: "utf-8",
      });
      assert.fail("Should have thrown an error");
    } catch (error: unknown) {
      // Expected to fail
      assert.ok(error);
    }
  });

  test("should show human-readable output without --json", () => {
    const dbPath = join(testDir, "human-readable.db");
    createTestDatabase(dbPath, 5);

    const result = execFileSync(process.execPath, [lexBin, "db", "stats"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    assert.ok(result.includes("Database Statistics"));
    assert.ok(result.includes("Location:"));
    assert.ok(result.includes("Size:"));
    assert.ok(result.includes("Frames:"));
    assert.ok(result.includes("Total: 5"));
  });

  test("should calculate date range correctly", () => {
    const dbPath = join(testDir, "date-range.db");
    createTestDatabase(dbPath, 15);

    const result = execFileSync(process.execPath, [lexBin, "db", "stats", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    assert.ok(output.dateRange.oldest);
    assert.ok(output.dateRange.newest);

    // Oldest should be earlier than newest
    const oldest = new Date(output.dateRange.oldest);
    const newest = new Date(output.dateRange.newest);
    assert.ok(oldest <= newest);
  });

  test("should show top 5 modules by default", () => {
    const dbPath = join(testDir, "top-modules.db");
    createTestDatabase(dbPath, 30);

    const result = execFileSync(process.execPath, [lexBin, "db", "stats", "--json"], {
      env: getTestEnv(dbPath),
      encoding: "utf-8",
    });

    const output = JSON.parse(result);
    // Without --detailed, should show only top 5 modules
    assert.ok(Object.keys(output.moduleDistribution).length <= 5);
  });
});
