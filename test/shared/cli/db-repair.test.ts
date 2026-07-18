import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createDatabase, DATABASE_SCHEMA_VERSION } from "@app/memory/store/db.js";
import { LEGACY_DIVERGENT_SCHEMA_VERSION } from "@app/memory/store/sqlite/schema-integrity.js";

const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

function cliEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    LEX_LOG_LEVEL: "silent",
    PATH: process.env.PATH,
  };
}

function makeDivergentVersion13(dbPath: string): void {
  const db = createDatabase(dbPath);
  db.exec("ALTER TABLE frames DROP COLUMN module_attribution");
  db.prepare("DELETE FROM schema_version WHERE version = ?").run(DATABASE_SCHEMA_VERSION);
  db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(
    LEGACY_DIVERGENT_SCHEMA_VERSION
  );
  db.close();
}

test("lex db repair JSON diagnoses compactly and requires --write to mutate", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-db-repair-cli-"));
  const dbPath = join(root, "memory.db");

  try {
    makeDivergentVersion13(dbPath);

    const diagnosis = JSON.parse(
      execFileSync(process.execPath, [lexBin, "--json", "db", "repair", "--database", dbPath], {
        encoding: "utf8",
        env: cliEnvironment(),
      })
    ) as Record<string, unknown>;

    assert.strictEqual(diagnosis.mode, "diagnose");
    assert.strictEqual(diagnosis.changed, false);
    assert.strictEqual(diagnosis.backup, null);
    assert.strictEqual("before" in diagnosis, false);
    assert.strictEqual(
      (diagnosis.inspection as { schema_version: number }).schema_version,
      LEGACY_DIVERGENT_SCHEMA_VERSION
    );

    const repair = JSON.parse(
      execFileSync(
        process.execPath,
        [lexBin, "--json", "db", "repair", "--database", dbPath, "--write"],
        { encoding: "utf8", env: cliEnvironment() }
      )
    ) as Record<string, unknown>;

    assert.strictEqual(repair.mode, "write");
    assert.strictEqual(repair.changed, true);
    assert.ok(typeof repair.backup === "string" && existsSync(repair.backup));
    assert.ok("before" in repair);
    assert.strictEqual(
      (repair.inspection as { schema_version: number }).schema_version,
      DATABASE_SCHEMA_VERSION
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
