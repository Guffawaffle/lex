/**
 * Tests for database encryption with SQLCipher
 *
 * Tests encryption key derivation, encrypted database operations,
 * and error handling for invalid keys.
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
} from "@app/memory/store/db.js";
import { saveFrame, getFrameById, deleteFrame } from "@app/memory/store/index.js";
import type { Frame } from "../frames/types.js";
import Database from "better-sqlite3-multiple-ciphers";

describe("Database Encryption Tests", () => {
  describe("Key Derivation", () => {
    test("should derive consistent key from same passphrase", () => {
      const key1 = deriveEncryptionKey("test-passphrase-123");
      const key2 = deriveEncryptionKey("test-passphrase-123");
      assert.strictEqual(key1, key2, "Same passphrase should produce same key");
    });

    test("should derive different keys from different passphrases", () => {
      const key1 = deriveEncryptionKey("passphrase-1");
      const key2 = deriveEncryptionKey("passphrase-2");
      assert.notStrictEqual(key1, key2, "Different passphrases should produce different keys");
    });

    test("should return 64-character hex string (256-bit key)", () => {
      const key = deriveEncryptionKey("test-passphrase");
      assert.strictEqual(key.length, 64, "Key should be 64 hex characters (32 bytes)");
      assert.ok(/^[0-9a-f]{64}$/.test(key), "Key should be valid hex string");
    });
  });

  describe("Environment-based Key Management", () => {
    const originalEnv = process.env.LEX_DB_KEY;
    const originalNodeEnv = process.env.NODE_ENV;

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
    });

    test("should return undefined when LEX_DB_KEY not set in non-production", () => {
      delete process.env.LEX_DB_KEY;
      process.env.NODE_ENV = "test";
      const key = getEncryptionKey();
      assert.strictEqual(key, undefined, "Should return undefined when key not set");
    });

    test("should return derived key when LEX_DB_KEY is set", () => {
      process.env.LEX_DB_KEY = "my-secret-passphrase";
      process.env.NODE_ENV = "test";
      const key = getEncryptionKey();
      assert.ok(key, "Should return a key when LEX_DB_KEY is set");
      assert.strictEqual(key.length, 64, "Should return 64-character hex key");
    });

    test("should throw error in production mode without LEX_DB_KEY", () => {
      delete process.env.LEX_DB_KEY;
      process.env.NODE_ENV = "production";
      assert.throws(
        () => getEncryptionKey(),
        /LEX_DB_KEY environment variable is required in production/,
        "Should throw error in production without key"
      );
    });

    test("should not throw in production mode with LEX_DB_KEY", () => {
      process.env.LEX_DB_KEY = "production-secret-key";
      process.env.NODE_ENV = "production";
      assert.doesNotThrow(() => getEncryptionKey(), "Should not throw with key in production");
    });
  });

  describe("Encrypted Database Operations", () => {
    const TEST_DB_PATH = join(tmpdir(), `test-encrypted-${Date.now()}.db`);
    const TEST_PASSPHRASE = "test-encryption-key-123";
    const originalEnv = process.env.LEX_DB_KEY;

    before(() => {
      process.env.LEX_DB_KEY = TEST_PASSPHRASE;
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

    test("should create encrypted database successfully", () => {
      const db = createDatabase(TEST_DB_PATH);
      assert.ok(db, "Database should be created");
      
      // Verify database is accessible
      const result = db.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number };
      assert.strictEqual(typeof result.count, "number", "Should be able to query encrypted database");
      
      db.close();
    });

    test("should save and retrieve data from encrypted database", () => {
      const db = createDatabase(TEST_DB_PATH);
      
      const testFrame: Frame = {
        id: "encrypted-frame-001",
        timestamp: new Date().toISOString(),
        branch: "feature/encryption",
        module_scope: ["security"],
        summary_caption: "Testing encrypted database",
        reference_point: "encryption test",
        status_snapshot: {
          next_action: "Verify encryption works",
        },
        keywords: ["encryption", "security", "sqlcipher"],
      };

      saveFrame(db, testFrame);
      const retrieved = getFrameById(db, "encrypted-frame-001");
      
      assert.ok(retrieved, "Frame should be retrieved from encrypted database");
      assert.strictEqual(retrieved!.id, testFrame.id);
      assert.strictEqual(retrieved!.summary_caption, testFrame.summary_caption);
      assert.deepStrictEqual(retrieved!.keywords, testFrame.keywords);
      
      deleteFrame(db, "encrypted-frame-001");
      db.close();
    });

    test("should fail to open encrypted database with wrong key", () => {
      // First create and close an encrypted database
      const db1 = createDatabase(TEST_DB_PATH);
      db1.close();

      // Try to open with wrong key
      process.env.LEX_DB_KEY = "wrong-passphrase";
      
      assert.throws(
        () => createDatabase(TEST_DB_PATH),
        /Failed to open encrypted database/,
        "Should throw error when opening with wrong key"
      );
      
      // Restore correct key for cleanup
      process.env.LEX_DB_KEY = TEST_PASSPHRASE;
    });

    test("should fail to open encrypted database without key", () => {
      // First create and close an encrypted database
      const db1 = createDatabase(TEST_DB_PATH);
      db1.close();

      // Try to open without key
      delete process.env.LEX_DB_KEY;
      process.env.NODE_ENV = "test"; // Ensure we're not in production
      
      const db2 = new Database(TEST_DB_PATH);
      
      // Attempting to read from encrypted database without key should fail
      assert.throws(
        () => db2.prepare("SELECT 1").get(),
        /file is not a database/,
        "Should fail to query encrypted database without key"
      );
      
      db2.close();
      
      // Restore key for cleanup
      process.env.LEX_DB_KEY = TEST_PASSPHRASE;
    });
  });

  describe("Unencrypted Database (backward compatibility)", () => {
    const TEST_DB_PATH = join(tmpdir(), `test-unencrypted-${Date.now()}.db`);
    const originalEnv = process.env.LEX_DB_KEY;

    before(() => {
      delete process.env.LEX_DB_KEY;
      process.env.NODE_ENV = "test";
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

    test("should create unencrypted database when LEX_DB_KEY not set", () => {
      const db = createDatabase(TEST_DB_PATH);
      assert.ok(db, "Unencrypted database should be created");
      
      const testFrame: Frame = {
        id: "unencrypted-frame-001",
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["core"],
        summary_caption: "Testing unencrypted database",
        reference_point: "backward compatibility",
        status_snapshot: {
          next_action: "Verify unencrypted mode works",
        },
      };

      saveFrame(db, testFrame);
      const retrieved = getFrameById(db, "unencrypted-frame-001");
      
      assert.ok(retrieved, "Frame should be retrieved from unencrypted database");
      assert.strictEqual(retrieved!.id, testFrame.id);
      
      deleteFrame(db, "unencrypted-frame-001");
      db.close();
    });

    test("unencrypted database should be readable without encryption", () => {
      // Create unencrypted database
      const db1 = createDatabase(TEST_DB_PATH);
      db1.prepare("INSERT INTO frames (id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        "test-frame",
        new Date().toISOString(),
        "main",
        JSON.stringify(["core"]),
        "Test",
        "Test reference",
        JSON.stringify({ next_action: "test" })
      );
      db1.close();

      // Open again without encryption
      const db2 = new Database(TEST_DB_PATH);
      const result = db2.prepare("SELECT COUNT(*) as count FROM frames").get() as { count: number };
      assert.strictEqual(result.count, 1, "Unencrypted database should be readable");
      db2.close();
    });
  });
});

console.log("\n✅ Database Encryption Tests - covering key derivation, encrypted operations, and error handling\n");
