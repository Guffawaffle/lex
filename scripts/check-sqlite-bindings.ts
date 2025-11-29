#!/usr/bin/env npx tsx
/**
 * SQLite Bindings Health Check
 *
 * This script validates that the native better-sqlite3-multiple-ciphers
 * bindings are correctly compiled for the current Node.js ABI version.
 *
 * Run this BEFORE tests to get a clear error message instead of 100+ cryptic failures.
 *
 * Exit codes:
 *   0 - Bindings are healthy
 *   1 - Bindings are broken (with fix instructions)
 *
 * @see docs/dev/sqlite-bindings.md
 */

const REBUILD_COMMAND = "npm run rebuild-sqlite";
const DOCS_PATH = "docs/dev/sqlite-bindings.md";

async function checkBindings(): Promise<void> {
  console.log("🔍 Checking SQLite native bindings...\n");

  try {
    // Step 1: Can we load the module at all?
    const sqlite = await import("better-sqlite3-multiple-ciphers");
    const Database = sqlite.default;

    // Step 2: Can we instantiate an in-memory database?
    const db = new Database(":memory:");

    // Step 3: Can we run basic operations?
    db.exec("CREATE TABLE health_check (id INTEGER PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO health_check (value) VALUES (?)").run("test");
    const row = db.prepare("SELECT value FROM health_check WHERE id = 1").get() as {
      value: string;
    };

    if (row?.value !== "test") {
      throw new Error("Query returned unexpected result");
    }

    // Step 4: Is SQLCipher available?
    try {
      db.pragma("cipher_version");
    } catch {
      console.warn("⚠️  SQLCipher extension not available (encryption may not work)\n");
    }

    db.close();

    console.log("✅ SQLite bindings are healthy\n");
    console.log(`   Node version: ${process.version}`);
    console.log(`   Platform: ${process.platform}-${process.arch}`);
    console.log("");
    process.exit(0);
  } catch (error) {
    const err = error as Error & { code?: string };

    // Detect binding-specific errors
    const isBindingError =
      err.message?.includes("NODE_MODULE_VERSION") ||
      err.message?.includes("was compiled against") ||
      err.message?.includes("module did not self-register") ||
      err.message?.includes("native") ||
      err.code === "ERR_DLOPEN_FAILED";

    console.error("❌ SQLite bindings are BROKEN\n");

    if (isBindingError) {
      console.error("   This typically happens when:");
      console.error("   • Node.js was upgraded/downgraded");
      console.error("   • node_modules was copied from another machine");
      console.error("   • Fresh npm ci after switching Node versions\n");
      console.error("   FIX: Run this command:\n");
      console.error(`      ${REBUILD_COMMAND}\n`);
      console.error(`   See ${DOCS_PATH} for details.\n`);
    } else {
      console.error(`   Unexpected error: ${err.message}\n`);
      console.error("   This may indicate a different problem with the SQLite installation.\n");
    }

    console.error(`   Node version: ${process.version}`);
    console.error(`   Platform: ${process.platform}-${process.arch}`);
    console.error("");

    process.exit(1);
  }
}

checkBindings();
