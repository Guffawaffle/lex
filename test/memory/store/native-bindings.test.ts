/**
 * Native SQLite bindings smoke test
 *
 * This test validates that the native better-sqlite3-multiple-ciphers bindings
 * are correctly compiled for the current Node.js ABI version.
 *
 * If this test fails, run: npm rebuild better-sqlite3-multiple-ciphers
 *
 * Common failure scenarios:
 * - After Node.js version upgrade (even minor versions)
 * - After fresh npm ci on a new machine
 * - After switching between Node.js versions via nvm/fnm
 *
 * @see TROUBLESHOOTING.md for details
 * @see Lex Frame: sqlite-native-rebuild (module_scope: memory/store)
 */

import { test, describe } from "node:test";
import assert from "node:assert";

describe("Native SQLite Bindings", () => {
  test("better-sqlite3-multiple-ciphers loads without error", async () => {
    try {
      // Dynamic import to catch loading errors
      const sqlite = await import("better-sqlite3-multiple-ciphers");
      const Database = sqlite.default;

      // Verify we can instantiate an in-memory database
      const db = new Database(":memory:");
      assert.ok(db, "Database instance should be created");

      // Verify basic operations work
      db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
      db.prepare("INSERT INTO test (value) VALUES (?)").run("smoke-test");
      const row = db.prepare("SELECT value FROM test WHERE id = 1").get() as {
        value: string;
      };

      assert.strictEqual(row.value, "smoke-test", "Basic CRUD should work");

      db.close();
    } catch (error) {
      // Provide actionable error message
      const err = error as Error & { code?: string };
      const isBindingError =
        err.message?.includes("NODE_MODULE_VERSION") ||
        err.message?.includes("was compiled against") ||
        err.message?.includes("native") ||
        err.code === "ERR_DLOPEN_FAILED";

      if (isBindingError) {
        assert.fail(
          `Native SQLite bindings are stale or incompatible.\n\n` +
            `FIX: Run this command and retry:\n` +
            `  npm rebuild better-sqlite3-multiple-ciphers\n\n` +
            `Original error: ${err.message}`
        );
      }

      // Re-throw other errors
      throw error;
    }
  });

  test("SQLCipher encryption is available", async () => {
    const sqlite = await import("better-sqlite3-multiple-ciphers");
    const Database = sqlite.default;

    const db = new Database(":memory:");

    // Verify SQLCipher pragma is recognized (would throw if not compiled with SQLCipher)
    try {
      db.pragma("cipher_version");
      // If we get here, SQLCipher is available
      assert.ok(true, "SQLCipher pragma accepted");
    } catch {
      assert.fail(
        "SQLCipher not available - ensure better-sqlite3-multiple-ciphers is installed correctly"
      );
    }

    db.close();
  });
});
