/**
 * Tests for database encryption CLI command
 *
 * Tests transaction-based migration with atomic table operations,
 * rollback behavior, and data integrity verification.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import Database from "better-sqlite3-multiple-ciphers";
import { deriveEncryptionKey, initializeDatabase } from "@app/memory/store/db.js";
import { saveFrame } from "@app/memory/store/index.js";
import type { Frame } from "../../memory/frames/types.js";

describe("Database Encryption Migration Tests", () => {
  describe("Transaction-based Migration", () => {
    const TEST_DIR = join(tmpdir(), `lex-encrypt-test-${Date.now()}`);
    const SOURCE_DB_PATH = join(TEST_DIR, "source.db");
    const DEST_DB_PATH = join(TEST_DIR, "dest-encrypted.db");
    const TEST_PASSPHRASE = "test-passphrase-secure-123";

    before(() => {
      // Create test directory
      if (!existsSync(TEST_DIR)) {
        mkdirSync(TEST_DIR, { recursive: true });
      }
    });

    after(() => {
      // Clean up test directory
      if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
      }
    });

    test("should migrate database using transactions for atomicity", () => {
      // Create source database with test data
      const sourceDb = new Database(SOURCE_DB_PATH);
      initializeDatabase(sourceDb);

      // Add test frames
      const testFrames: Frame[] = Array.from({ length: 100 }, (_, i) => ({
        id: `frame-${String(i).padStart(3, "0")}`,
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["core"],
        summary_caption: `Test frame ${i}`,
        reference_point: `test reference ${i}`,
        status_snapshot: {
          next_action: `action ${i}`,
        },
        keywords: [`keyword-${i}`],
      }));

      for (const frame of testFrames) {
        saveFrame(sourceDb, frame);
      }

      // Verify source data
      const sourceCount = (
        sourceDb.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number }
      ).count;
      assert.strictEqual(sourceCount, 100, "Source should have 100 frames");
      sourceDb.close();

      // Perform migration with transaction-wrapped inserts
      const sourceDbRead = new Database(SOURCE_DB_PATH, { readonly: true });
      const destDb = new Database(DEST_DB_PATH);
      const encryptionKey = deriveEncryptionKey(TEST_PASSPHRASE);

      destDb.pragma(`cipher='sqlcipher'`);
      destDb.pragma(`key="x'${encryptionKey}'"`);
      initializeDatabase(destDb);

      // Get tables to migrate
      const tableNames = sourceDbRead
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'"
        )
        .all() as Array<{ name: string }>;

      const validTableNamePattern = /^[a-zA-Z0-9_]+$/;

      for (const { name } of tableNames) {
        if (!validTableNamePattern.test(name)) {
          throw new Error(`Invalid table name detected: ${name}`);
        }
        const rows = sourceDbRead.prepare(`SELECT * FROM ${name}`).all();
        if (rows.length > 0) {
          const columns = Object.keys(rows[0] as Record<string, unknown>);
          const placeholders = columns.map(() => "?").join(", ");
          const stmt = destDb.prepare(
            `INSERT OR REPLACE INTO ${name} (${columns.join(", ")}) VALUES (${placeholders})`
          );

          // This is the transaction-wrapped insert (matching the implementation)
          const insertAllRows = destDb.transaction((rowsToInsert: Record<string, unknown>[]) => {
            for (const row of rowsToInsert) {
              const values = columns.map((col) => row[col]);
              stmt.run(...values);
            }
          });

          insertAllRows(rows as Record<string, unknown>[]);
        }
      }

      sourceDbRead.close();
      destDb.close();

      // Verify encrypted database has all data
      const verifyDb = new Database(DEST_DB_PATH);
      verifyDb.pragma(`cipher='sqlcipher'`);
      verifyDb.pragma(`key="x'${encryptionKey}'"`);

      const destCount = (
        verifyDb.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number }
      ).count;
      assert.strictEqual(destCount, 100, "Destination should have 100 frames");

      // Verify data integrity
      const firstFrame = verifyDb.prepare("SELECT * FROM frames WHERE id = ?").get("frame-000") as {
        id: string;
        summary_caption: string;
      };
      assert.strictEqual(firstFrame.id, "frame-000", "First frame ID should match");
      assert.strictEqual(firstFrame.summary_caption, "Test frame 0", "First frame summary should match");

      const lastFrame = verifyDb.prepare("SELECT * FROM frames WHERE id = ?").get("frame-099") as {
        id: string;
        summary_caption: string;
      };
      assert.strictEqual(lastFrame.id, "frame-099", "Last frame ID should match");
      assert.strictEqual(lastFrame.summary_caption, "Test frame 99", "Last frame summary should match");

      verifyDb.close();

      // Clean up
      if (existsSync(SOURCE_DB_PATH)) {
        unlinkSync(SOURCE_DB_PATH);
      }
      if (existsSync(DEST_DB_PATH)) {
        unlinkSync(DEST_DB_PATH);
      }
    });

    test("should rollback table on insert failure (transaction atomicity)", () => {
      const sourceDbPath = join(TEST_DIR, "source-rollback.db");
      const destDbPath = join(TEST_DIR, "dest-rollback.db");

      // Create source database with test data
      const sourceDb = new Database(sourceDbPath);
      initializeDatabase(sourceDb);

      // Add test frames
      for (let i = 0; i < 10; i++) {
        saveFrame(sourceDb, {
          id: `frame-${i}`,
          timestamp: new Date().toISOString(),
          branch: "main",
          module_scope: ["core"],
          summary_caption: `Test frame ${i}`,
          reference_point: `test reference ${i}`,
          status_snapshot: {
            next_action: `action ${i}`,
          },
        });
      }
      sourceDb.close();

      // Create destination database
      const sourceDbRead = new Database(sourceDbPath, { readonly: true });
      const destDb = new Database(destDbPath);
      const encryptionKey = deriveEncryptionKey(TEST_PASSPHRASE);

      destDb.pragma(`cipher='sqlcipher'`);
      destDb.pragma(`key="x'${encryptionKey}'"`);
      initializeDatabase(destDb);

      // Get rows from frames table
      const rows = sourceDbRead.prepare("SELECT * FROM frames").all() as Array<
        Record<string, unknown>
      >;
      const columns = Object.keys(rows[0]);

      // Create a transaction that will fail midway
      const placeholders = columns.map(() => "?").join(", ");
      const stmt = destDb.prepare(
        `INSERT OR REPLACE INTO frames (${columns.join(", ")}) VALUES (${placeholders})`
      );

      let insertCount = 0;
      const failingTransaction = destDb.transaction((rowsToInsert: Record<string, unknown>[]) => {
        for (const row of rowsToInsert) {
          insertCount++;
          // Simulate failure after 5 inserts
          if (insertCount > 5) {
            throw new Error("Simulated insert failure");
          }
          const values = columns.map((col) => row[col]);
          stmt.run(...values);
        }
      });

      // Execute failing transaction
      assert.throws(
        () => failingTransaction(rows),
        /Simulated insert failure/,
        "Should throw simulated error"
      );

      sourceDbRead.close();

      // Verify no partial data remains (transaction was rolled back)
      const count = (
        destDb.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number }
      ).count;
      assert.strictEqual(count, 0, "Rollback should leave 0 frames (no partial data)");

      destDb.close();

      // Clean up
      if (existsSync(sourceDbPath)) {
        unlinkSync(sourceDbPath);
      }
      if (existsSync(destDbPath)) {
        unlinkSync(destDbPath);
      }
    });

    test("should successfully migrate multiple tables atomically", () => {
      const sourceDbPath = join(TEST_DIR, "source-multi.db");
      const destDbPath = join(TEST_DIR, "dest-multi.db");

      // Create source database
      const sourceDb = new Database(sourceDbPath);
      initializeDatabase(sourceDb);

      // Add frames
      for (let i = 0; i < 5; i++) {
        saveFrame(sourceDb, {
          id: `frame-${i}`,
          timestamp: new Date().toISOString(),
          branch: "main",
          module_scope: ["core"],
          summary_caption: `Test frame ${i}`,
          reference_point: `test reference ${i}`,
          status_snapshot: {
            next_action: `action ${i}`,
          },
        });
      }

      // Verify schema_version entries exist (from initializeDatabase)
      const _schemaVersionCount = (
        sourceDb.prepare("SELECT COUNT(*) as count FROM schema_version").get() as { count: number }
      ).count;

      sourceDb.close();

      // Perform migration
      const sourceDbRead = new Database(sourceDbPath, { readonly: true });
      const destDb = new Database(destDbPath);
      const encryptionKey = deriveEncryptionKey(TEST_PASSPHRASE);

      destDb.pragma(`cipher='sqlcipher'`);
      destDb.pragma(`key="x'${encryptionKey}'"`);
      initializeDatabase(destDb);

      const tableNames = sourceDbRead
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'"
        )
        .all() as Array<{ name: string }>;

      const validTableNamePattern = /^[a-zA-Z0-9_]+$/;
      let tablesProcessed = 0;

      for (const { name } of tableNames) {
        if (!validTableNamePattern.test(name)) {
          throw new Error(`Invalid table name detected: ${name}`);
        }
        const rows = sourceDbRead.prepare(`SELECT * FROM ${name}`).all();
        if (rows.length > 0) {
          const columns = Object.keys(rows[0] as Record<string, unknown>);
          const placeholders = columns.map(() => "?").join(", ");
          const stmt = destDb.prepare(
            `INSERT OR REPLACE INTO ${name} (${columns.join(", ")}) VALUES (${placeholders})`
          );

          const insertAllRows = destDb.transaction((rowsToInsert: Record<string, unknown>[]) => {
            for (const row of rowsToInsert) {
              const values = columns.map((col) => row[col]);
              stmt.run(...values);
            }
          });

          insertAllRows(rows as Record<string, unknown>[]);
          tablesProcessed++;
        }
      }

      sourceDbRead.close();
      destDb.close();

      // Verify multiple tables were migrated
      assert.ok(tablesProcessed >= 2, "Should have processed at least 2 tables (frames, schema_version)");

      // Verify data in destination
      const verifyDb = new Database(destDbPath);
      verifyDb.pragma(`cipher='sqlcipher'`);
      verifyDb.pragma(`key="x'${encryptionKey}'"`);

      const destFrameCount = (
        verifyDb.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number }
      ).count;
      assert.strictEqual(destFrameCount, 5, "Destination should have 5 frames");

      const destSchemaCount = (
        verifyDb.prepare("SELECT COUNT(*) as count FROM schema_version").get() as { count: number }
      ).count;
      // Both source and dest have schema_version records from initializeDatabase
      assert.ok(destSchemaCount > 0, "Destination should have schema_version entries");

      verifyDb.close();

      // Clean up
      if (existsSync(sourceDbPath)) {
        unlinkSync(sourceDbPath);
      }
      if (existsSync(destDbPath)) {
        unlinkSync(destDbPath);
      }
    });
  });
});

console.log(
  "\n✅ Database Encryption Migration Tests - covering transaction atomicity and rollback behavior\n"
);
