/**
 * Edge Case Tests for Database Encryption
 *
 * Additional test coverage for encryption edge cases:
 * - Whitespace-only passphrase rejection
 * - Boundary passphrase lengths (11 chars rejected, 12 chars accepted)
 * - Wrong passphrase open/close behavior
 * - Migration rollback when insert fails mid-copy
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createDatabase,
  deriveEncryptionKey,
  getEncryptionKey,
  initializeDatabase,
  validatePassphraseStrength,
} from "@app/memory/store/db.js";
import Database from "better-sqlite3-multiple-ciphers";

describe("Encryption Edge Cases", () => {
  describe("deriveEncryptionKey Validation", () => {
    test("should reject empty passphrase", () => {
      assert.throws(
        () => deriveEncryptionKey(""),
        /Passphrase cannot be empty or whitespace-only/,
        "Empty passphrase should be rejected"
      );
    });

    test("should reject whitespace-only passphrase (spaces)", () => {
      assert.throws(
        () => deriveEncryptionKey("            "),
        /Passphrase cannot be empty or whitespace-only/,
        "Whitespace-only passphrase should be rejected"
      );
    });

    test("should reject whitespace-only passphrase (tabs)", () => {
      assert.throws(
        () => deriveEncryptionKey("\t\t\t\t"),
        /Passphrase cannot be empty or whitespace-only/,
        "Tab-only passphrase should be rejected"
      );
    });

    test("should reject whitespace-only passphrase (mixed whitespace)", () => {
      assert.throws(
        () => deriveEncryptionKey("  \t\n  \r  "),
        /Passphrase cannot be empty or whitespace-only/,
        "Mixed whitespace-only passphrase should be rejected"
      );
    });

    test("should reject passphrase shorter than 12 characters (11 chars)", () => {
      assert.throws(
        () => deriveEncryptionKey("Abc123!@#ab"), // 11 characters with diversity
        /Passphrase is too short. Use at least 12 characters/,
        "11-character passphrase should be rejected"
      );
    });

    test("should accept passphrase with exactly 12 characters and proper diversity", () => {
      const key = deriveEncryptionKey("Abc123!@#xyz"); // 12 characters with 4 classes
      assert.ok(key, "12-character passphrase with diversity should be accepted");
      assert.strictEqual(key.length, 64, "Key should be 64 hex characters");
      assert.ok(/^[0-9a-f]{64}$/.test(key), "Key should be valid hex string");
    });

    test("should accept passphrase longer than 12 characters with diversity", () => {
      const key = deriveEncryptionKey("Abc123!@#xyzW"); // 13 characters with 4 classes
      assert.ok(key, "13-character passphrase with diversity should be accepted");
      assert.strictEqual(key.length, 64, "Key should be 64 hex characters");
    });

    test("should reject passphrase with less than 3 character classes", () => {
      // Only lowercase letters (1 class)
      assert.throws(
        () => deriveEncryptionKey("abcdefghijkl"),
        /Passphrase lacks character diversity.*Found 1 class/,
        "Passphrase with only lowercase should be rejected"
      );

      // Only lowercase and digits (2 classes)
      assert.throws(
        () => deriveEncryptionKey("abcd12345678"),
        /Passphrase lacks character diversity.*Found 2 class/,
        "Passphrase with only 2 classes should be rejected"
      );
    });

    test("should accept passphrase with 3 character classes", () => {
      // lowercase, uppercase, digits (3 classes) - no sequential patterns
      const key = deriveEncryptionKey("Wrtm13579Plm");
      assert.ok(key, "Passphrase with 3 character classes should be accepted");
      assert.strictEqual(key.length, 64, "Key should be 64 hex characters");
    });

    test("should reject passphrase with repeating characters", () => {
      assert.throws(
        () => deriveEncryptionKey("Abc1aaaa!@#X"), // Contains "aaaa"
        /Passphrase contains repeating character patterns/,
        "Passphrase with 4+ identical consecutive characters should be rejected"
      );
    });

    test("should reject passphrase with sequential patterns", () => {
      // Contains "abcd" sequential pattern
      assert.throws(
        () => deriveEncryptionKey("Xyzabcd!@#12"),
        /Passphrase contains sequential character patterns/,
        "Passphrase with sequential pattern should be rejected"
      );

      // Contains "1234" sequential pattern
      assert.throws(
        () => deriveEncryptionKey("Xyz1234!@#ab"),
        /Passphrase contains sequential character patterns/,
        "Passphrase with numeric sequential pattern should be rejected"
      );
    });

    test("should reject passphrase with keyboard patterns", () => {
      assert.throws(
        () => deriveEncryptionKey("Xqwerty!@#12"),
        /Passphrase contains sequential character patterns/,
        "Passphrase with qwerty pattern should be rejected"
      );

      assert.throws(
        () => deriveEncryptionKey("X123456!@#ab"),
        /Passphrase contains sequential character patterns/,
        "Passphrase with 123456 pattern should be rejected"
      );
    });

    test("should allow bypass with force option", () => {
      // Would normally fail due to only 1 character class
      const key = deriveEncryptionKey("abcdefghijkl", undefined, { force: true });
      assert.ok(key, "Weak passphrase should be accepted with force option");
      assert.strictEqual(key.length, 64, "Key should be 64 hex characters");
    });

    test("should reject long whitespace-only passphrase", () => {
      // deriveEncryptionKey checks `passphrase.trim().length === 0` first,
      // rejecting whitespace-only strings regardless of their total length
      assert.throws(
        () => deriveEncryptionKey("             "), // 13 spaces - rejected because trim is empty
        /Passphrase cannot be empty or whitespace-only/,
        "Passphrase with enough length but only whitespace should be rejected"
      );
    });
  });

  describe("validatePassphraseStrength", () => {
    test("should return validation result for empty passphrase", () => {
      const result = validatePassphraseStrength("");
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("empty or whitespace-only")));
      assert.strictEqual(result.characterClasses.count, 0);
    });

    test("should return validation result with character class info", () => {
      const result = validatePassphraseStrength("Abc123!@#xyz");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.characterClasses.hasLowercase, true);
      assert.strictEqual(result.characterClasses.hasUppercase, true);
      assert.strictEqual(result.characterClasses.hasDigit, true);
      assert.strictEqual(result.characterClasses.hasSymbol, true);
      assert.strictEqual(result.characterClasses.count, 4);
    });

    test("should detect missing character classes", () => {
      const result = validatePassphraseStrength("abcdefghijkl");
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.characterClasses.hasLowercase, true);
      assert.strictEqual(result.characterClasses.hasUppercase, false);
      assert.strictEqual(result.characterClasses.hasDigit, false);
      assert.strictEqual(result.characterClasses.hasSymbol, false);
      assert.strictEqual(result.characterClasses.count, 1);
    });

    test("should provide warnings for short but valid passphrases", () => {
      const result = validatePassphraseStrength("Abc123!@#xyz");
      assert.strictEqual(result.valid, true);
      assert.ok(result.warnings.some((w) => w.includes("32+ characters")));
    });

    test("should not warn for long strong passphrases", () => {
      const result = validatePassphraseStrength("Abc123!@#xyzAbc123!@#xyzAbc123!@");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.warnings.length, 0);
    });
  });

  describe("getEncryptionKey Validation", () => {
    const originalEnv = process.env.LEX_DB_KEY;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalForce = process.env.LEX_DB_KEY_FORCE;

    after(() => {
      // Restore original environment
      if (originalEnv !== undefined) {
        process.env.LEX_DB_KEY = originalEnv;
      } else {
        delete process.env.LEX_DB_KEY;
      }
      if (originalNodeEnv !== undefined) {
        process.env.NODE_ENV = originalNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalForce !== undefined) {
        process.env.LEX_DB_KEY_FORCE = originalForce;
      } else {
        delete process.env.LEX_DB_KEY_FORCE;
      }
    });

    test("should throw in production mode with whitespace-only LEX_DB_KEY", () => {
      process.env.LEX_DB_KEY = "          ";
      process.env.NODE_ENV = "production";
      delete process.env.LEX_DB_KEY_FORCE;
      assert.throws(
        () => getEncryptionKey(),
        /LEX_DB_KEY environment variable is required in production mode and must not be empty or whitespace-only/,
        "Should throw error in production with whitespace-only key"
      );
    });

    test("should return undefined in non-production with whitespace-only LEX_DB_KEY", () => {
      process.env.LEX_DB_KEY = "          ";
      process.env.NODE_ENV = "test";
      delete process.env.LEX_DB_KEY_FORCE;
      const key = getEncryptionKey();
      assert.strictEqual(
        key,
        undefined,
        "Should return undefined for whitespace-only key in non-production"
      );
    });

    test("should bypass validation when LEX_DB_KEY_FORCE=true", () => {
      // Weak passphrase that would normally fail
      process.env.LEX_DB_KEY = "weakpassword";
      process.env.NODE_ENV = "test";
      process.env.LEX_DB_KEY_FORCE = "true";

      const key = getEncryptionKey();
      assert.ok(key, "Should return key when force bypass is enabled");
      assert.strictEqual(key.length, 64, "Key should be 64 hex characters");
    });

    test("should not bypass validation when LEX_DB_KEY_FORCE is not 'true'", () => {
      process.env.LEX_DB_KEY = "weakpassword";
      process.env.NODE_ENV = "test";
      process.env.LEX_DB_KEY_FORCE = "false";

      assert.throws(
        () => getEncryptionKey(),
        /Passphrase lacks character diversity/,
        "Should still validate when LEX_DB_KEY_FORCE is not 'true'"
      );
    });
  });

  describe("Wrong Passphrase Handling", () => {
    const TEST_DB_PATH = join(tmpdir(), `test-wrong-pass-${Date.now()}.db`);
    // Updated passphrases to meet character diversity requirements (3+ classes)
    const CORRECT_PASSPHRASE = "Correct-Pass12!";
    const WRONG_PASSPHRASE = "Wrong-Pass123!!";
    const originalEnv = process.env.LEX_DB_KEY;

    before(() => {
      if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
      }
    });

    after(() => {
      if (originalEnv !== undefined) {
        process.env.LEX_DB_KEY = originalEnv;
      } else {
        delete process.env.LEX_DB_KEY;
      }
      if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
      }
    });

    test("should fail to open database created with different passphrase", () => {
      // Create database with correct passphrase
      process.env.LEX_DB_KEY = CORRECT_PASSPHRASE;
      const db = createDatabase(TEST_DB_PATH);
      db.close();

      // Try to open with wrong passphrase
      process.env.LEX_DB_KEY = WRONG_PASSPHRASE;
      assert.throws(
        () => createDatabase(TEST_DB_PATH),
        /Failed to open encrypted database/,
        "Should fail to open with wrong passphrase"
      );

      // Restore correct key for cleanup
      process.env.LEX_DB_KEY = CORRECT_PASSPHRASE;
    });

    test("should not corrupt database when opened with wrong key and then correct key", () => {
      // Ensure database exists with correct key
      process.env.LEX_DB_KEY = CORRECT_PASSPHRASE;
      const db1 = createDatabase(TEST_DB_PATH);

      // Insert test data
      db1
        .prepare(
          `INSERT OR REPLACE INTO frames 
         (id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "test-frame-001",
          new Date().toISOString(),
          "main",
          JSON.stringify(["core"]),
          "Test frame for corruption check",
          "corruption test reference",
          JSON.stringify({ next_action: "verify no corruption" })
        );
      db1.close();

      // Try to open with wrong key (should fail)
      process.env.LEX_DB_KEY = WRONG_PASSPHRASE;
      assert.throws(
        () => createDatabase(TEST_DB_PATH),
        /Failed to open encrypted database/
      );

      // Reopen with correct key and verify data is intact
      process.env.LEX_DB_KEY = CORRECT_PASSPHRASE;
      const db2 = createDatabase(TEST_DB_PATH);
      const frame = db2.prepare("SELECT * FROM frames WHERE id = ?").get("test-frame-001") as {
        id: string;
        summary_caption: string;
      } | null;

      assert.ok(frame, "Frame should still exist after failed wrong-key access");
      assert.strictEqual(frame.id, "test-frame-001");
      assert.strictEqual(frame.summary_caption, "Test frame for corruption check");

      db2.close();
    });
  });

  describe("Migration Rollback on Insert Failure", () => {
    // Updated passphrase to meet character diversity requirements (3+ classes)
    const PASSPHRASE = "Migration-Test!123";
    const originalEnv = process.env.LEX_DB_KEY;

    after(() => {
      if (originalEnv !== undefined) {
        process.env.LEX_DB_KEY = originalEnv;
      } else {
        delete process.env.LEX_DB_KEY;
      }
    });

    test("should rollback table inserts on constraint violation", () => {
      const TEST_DB_PATH = join(tmpdir(), `test-rollback-${Date.now()}.db`);

      try {
        // Create a database with encryption key
        process.env.LEX_DB_KEY = PASSPHRASE;
        const db = createDatabase(TEST_DB_PATH);

        // Insert some valid data
        db.prepare(
          `INSERT INTO frames 
           (id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          "valid-frame-001",
          new Date().toISOString(),
          "main",
          JSON.stringify(["core"]),
          "Valid frame",
          "Valid reference",
          JSON.stringify({ next_action: "proceed" })
        );

        // Verify the valid frame exists
        const validFrame = db
          .prepare("SELECT * FROM frames WHERE id = ?")
          .get("valid-frame-001") as { id: string } | null;
        assert.ok(validFrame, "Valid frame should exist");

        // Now test transaction rollback using the transaction() wrapper
        // Create a transaction that will fail mid-way
        const insertWithFailure = db.transaction(() => {
          // Insert first frame (will succeed)
          db.prepare(
            `INSERT INTO frames 
             (id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            "rollback-frame-001",
            new Date().toISOString(),
            "main",
            JSON.stringify(["core"]),
            "Frame before failure",
            "rollback test",
            JSON.stringify({ next_action: "test" })
          );

          // Insert second frame with NULL in NOT NULL column (will fail)
          db.prepare(
            `INSERT INTO frames 
             (id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            "rollback-frame-002",
            new Date().toISOString(),
            "main",
            null, // NULL in NOT NULL column - will cause constraint violation
            "Frame that causes failure",
            "rollback test",
            JSON.stringify({ next_action: "test" })
          );
        });

        // Execute transaction (should fail)
        assert.throws(
          () => insertWithFailure(),
          /NOT NULL constraint failed|SQLITE_CONSTRAINT/,
          "Transaction should fail on NOT NULL constraint"
        );

        // Verify the transaction was rolled back - neither frame should exist
        const frame1 = db
          .prepare("SELECT * FROM frames WHERE id = ?")
          .get("rollback-frame-001") as { id: string } | null;
        const frame2 = db
          .prepare("SELECT * FROM frames WHERE id = ?")
          .get("rollback-frame-002") as { id: string } | null;

        assert.strictEqual(frame1, undefined, "First frame should not exist after rollback");
        assert.strictEqual(frame2, undefined, "Second frame should not exist after rollback");

        // Verify original data is still intact
        const originalFrame = db
          .prepare("SELECT * FROM frames WHERE id = ?")
          .get("valid-frame-001") as { id: string } | null;
        assert.ok(originalFrame, "Original frame should still exist after failed transaction");

        db.close();
      } finally {
        if (existsSync(TEST_DB_PATH)) {
          unlinkSync(TEST_DB_PATH);
        }
      }
    });

    test("should maintain table integrity when copy fails for one table", () => {
      const SOURCE_DB_PATH = join(tmpdir(), `test-copy-source-${Date.now()}.db`);
      const DEST_DB_PATH = join(tmpdir(), `test-copy-dest-${Date.now()}.db`);

      try {
        // Create source database (unencrypted for simplicity)
        delete process.env.LEX_DB_KEY;
        const sourceDb = new Database(SOURCE_DB_PATH);
        initializeDatabase(sourceDb);

        // Insert valid data into source
        sourceDb
          .prepare(
            `INSERT INTO frames 
           (id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            "source-frame-001",
            new Date().toISOString(),
            "main",
            JSON.stringify(["core"]),
            "Source frame",
            "copy test",
            JSON.stringify({ next_action: "copy" })
          );

        sourceDb
          .prepare(
            `INSERT INTO frames 
           (id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            "source-frame-002",
            new Date().toISOString(),
            "main",
            JSON.stringify(["test"]),
            "Second source frame",
            "copy test 2",
            JSON.stringify({ next_action: "copy 2" })
          );

        sourceDb.close();

        // Create destination database and simulate partial copy with transaction
        const destDb = new Database(DEST_DB_PATH);
        initializeDatabase(destDb);

        // Read source data
        const readSourceDb = new Database(SOURCE_DB_PATH, { readonly: true });
        const sourceFrames = readSourceDb.prepare("SELECT * FROM frames").all() as Array<{
          id: string;
          timestamp: string;
          branch: string;
          module_scope: string;
          summary_caption: string;
          reference_point: string;
          status_snapshot: string;
        }>;
        readSourceDb.close();

        // Test that when we use a transaction and it fails, no partial data is left
        const copyWithFailure = destDb.transaction(() => {
          for (const frame of sourceFrames) {
            destDb
              .prepare(
                `INSERT INTO frames 
               (id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                frame.id,
                frame.timestamp,
                frame.branch,
                frame.module_scope,
                frame.summary_caption,
                frame.reference_point,
                frame.status_snapshot
              );
          }
          // Simulate failure after copying data
          throw new Error("Simulated copy failure");
        });

        // Execute transaction (should fail)
        assert.throws(() => copyWithFailure(), /Simulated copy failure/);

        // Verify no partial data exists in destination
        const destFrameCount = destDb.prepare("SELECT COUNT(*) as count FROM frames").get() as {
          count: number;
        };
        assert.strictEqual(destFrameCount.count, 0, "No frames should exist after failed copy");

        destDb.close();
      } finally {
        if (existsSync(SOURCE_DB_PATH)) {
          unlinkSync(SOURCE_DB_PATH);
        }
        if (existsSync(DEST_DB_PATH)) {
          unlinkSync(DEST_DB_PATH);
        }
      }
    });
  });
});

console.log(
  "\n✅ Encryption Edge Cases Tests - covering passphrase validation, wrong key handling, and rollback scenarios\n"
);
