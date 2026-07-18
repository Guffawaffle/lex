import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createDatabase } from "@app/memory/store/db.js";

const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");
const tenantId = "01900000-0000-7000-8000-000000000001";
const workspaceId = "01900000-0000-7000-8000-000000000002";
const principalId = "01900000-0000-7000-8000-000000000003";

function cliEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    LEX_LOG_LEVEL: "silent",
    PATH: process.env.PATH,
  };
}

function runJson(args: readonly string[]): Record<string, unknown> {
  return JSON.parse(
    execFileSync(process.execPath, [lexBin, "--json", ...args], {
      encoding: "utf8",
      env: cliEnvironment(),
    })
  ) as Record<string, unknown>;
}

test("lex db scope stages, applies, verifies, and recovers explicit ownership", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-db-scope-cli-"));
  const dbPath = join(root, "memory.db");
  const manifestPath = join(root, "scope-manifest.json");
  try {
    const db = createDatabase(dbPath);
    db.prepare(
      `INSERT INTO frames (
        id, timestamp, branch, module_scope, summary_caption, reference_point, status_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "cli-frame",
      "2026-07-18T00:00:00.000Z",
      "main",
      '["memory/store"]',
      "CLI scope migration",
      "explicit ownership staging",
      '{"next_action":"verify CLI"}'
    );
    db.close();

    const inventory = runJson(["db", "scope", "inventory", "--database", dbPath]);
    assert.equal(inventory.state, "legacy-unowned");
    assert.equal(inventory.sqliteSchemaVersion, 14);
    assert.equal(inventory.frameCount, 1);
    assert.equal(JSON.stringify(inventory).includes(dbPath), false);

    const manifest = runJson([
      "db",
      "scope",
      "manifest",
      "--database",
      dbPath,
      "--tenant-id",
      tenantId,
      "--workspace-id",
      workspaceId,
      "--creator-principal-id",
      principalId,
      "--scope-version",
      "scope-v1",
      "--output",
      manifestPath,
    ]);
    assert.equal(existsSync(manifestPath), true);
    assert.equal(typeof manifest.migrationId, "string");

    const dryRun = runJson([
      "db",
      "scope",
      "migrate",
      "--database",
      dbPath,
      "--manifest",
      manifestPath,
    ]);
    assert.equal((dryRun.receipt as Record<string, unknown>).outcome, "ready");
    assert.equal(dryRun.localRecoveryPath, null);

    const migrated = runJson([
      "db",
      "scope",
      "migrate",
      "--database",
      dbPath,
      "--manifest",
      manifestPath,
      "--write",
    ]);
    assert.equal((migrated.receipt as Record<string, unknown>).outcome, "migrated");
    assert.equal(typeof migrated.localRecoveryPath, "string");
    assert.equal(existsSync(migrated.localRecoveryPath as string), true);
    assert.equal(
      JSON.stringify((migrated.receipt as Record<string, unknown>).backup).includes(dbPath),
      false
    );

    const scoped = runJson(["db", "scope", "inventory", "--database", dbPath]);
    assert.equal(scoped.state, "scoped");
    assert.equal(scoped.sqliteSchemaVersion, 15);

    const recovery = runJson([
      "db",
      "scope",
      "recover",
      "--database",
      dbPath,
      "--backup",
      migrated.localRecoveryPath as string,
      "--write",
    ]);
    assert.equal(recovery.outcome, "restored");
    assert.equal(
      runJson(["db", "scope", "inventory", "--database", dbPath]).state,
      "legacy-unowned"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
