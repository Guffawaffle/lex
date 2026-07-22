import { resolve } from "node:path";

import Database from "better-sqlite3-multiple-ciphers";

import { SQLITE_BEHAVIORAL_STORE_SCHEMA_VERSION } from "./behavioral-store.js";

export interface SqliteBehavioralStoreInventoryV1 {
  readonly schemaVersion: number | null;
  readonly personaRevisionCount: number;
  readonly ruleRevisionCount: number;
  readonly evidenceCount: number;
  readonly promotionCount: number;
  readonly legacyBehaviorRuleTablePresent: boolean;
  readonly legacyPersonaTablePresent: boolean;
  readonly legacyRowsAdopted: 0;
}

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

function count(db: Database.Database, table: string): number {
  if (!tableExists(db, table)) return 0;
  const row = (() => {
    switch (table) {
      case "lex_behavioral_persona_revisions":
        return db.prepare("SELECT COUNT(*) AS count FROM lex_behavioral_persona_revisions").get();
      case "lex_behavioral_rule_revisions":
        return db.prepare("SELECT COUNT(*) AS count FROM lex_behavioral_rule_revisions").get();
      case "lex_behavioral_evidence":
        return db.prepare("SELECT COUNT(*) AS count FROM lex_behavioral_evidence").get();
      case "lex_behavioral_promotions":
        return db.prepare("SELECT COUNT(*) AS count FROM lex_behavioral_promotions").get();
      default:
        throw new Error("Unknown behavioral inventory relation");
    }
  })() as { count: number };
  return row.count;
}

/** Read-only, path-redacted inventory. It never opens or returns a normal-operation store. */
export function inventorySqliteBehavioralStore(
  databasePath: string
): SqliteBehavioralStoreInventoryV1 {
  const db = new Database(resolve(databasePath), { readonly: true, fileMustExist: true });
  try {
    const version = tableExists(db, "lex_behavioral_store_migrations")
      ? (
          db
            .prepare("SELECT MAX(version) AS version FROM lex_behavioral_store_migrations")
            .get() as { version: number | null }
        ).version
      : null;
    if (version !== null && version > SQLITE_BEHAVIORAL_STORE_SCHEMA_VERSION) {
      throw new Error(`SQLite behavioral schema ${version} is newer than supported`);
    }
    return Object.freeze({
      schemaVersion: version,
      personaRevisionCount: count(db, "lex_behavioral_persona_revisions"),
      ruleRevisionCount: count(db, "lex_behavioral_rule_revisions"),
      evidenceCount: count(db, "lex_behavioral_evidence"),
      promotionCount: count(db, "lex_behavioral_promotions"),
      legacyBehaviorRuleTablePresent: tableExists(db, "lexsona_behavior_rules"),
      legacyPersonaTablePresent: tableExists(db, "personas"),
      legacyRowsAdopted: 0,
    });
  } finally {
    db.close();
  }
}

/** Operator-only rollback script; callers must back up first and execute explicitly. */
export function sqliteBehavioralRollbackSql(): string {
  return `
    DROP TABLE IF EXISTS lex_behavioral_write_receipts;
    DROP TABLE IF EXISTS lex_behavioral_promotions;
    DROP TABLE IF EXISTS lex_behavioral_evidence;
    DROP TABLE IF EXISTS lex_behavioral_rule_revisions;
    DROP TABLE IF EXISTS lex_behavioral_persona_revisions;
    DROP TABLE IF EXISTS lex_behavioral_store_migrations;
  `;
}
