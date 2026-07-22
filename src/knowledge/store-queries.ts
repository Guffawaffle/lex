import Database from "better-sqlite3-multiple-ciphers";
import type { CompiledKnowledgeSnapshotV1 } from "./compiler.js";

export const KNOWLEDGE_STORE_SCHEMA_VERSION = 1 as const;

interface SchemaVersionRow {
  version: number;
}

interface TableNameRow {
  name: string;
}

interface SnapshotRow {
  snapshot_json: string;
}

export function initializeKnowledgeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_schema (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      repository_key TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS knowledge_snapshots_repository
      ON knowledge_snapshots(repository_key, created_at);

    CREATE TABLE IF NOT EXISTS active_knowledge_snapshots (
      repository_key TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      FOREIGN KEY(snapshot_id) REFERENCES knowledge_snapshots(snapshot_id) ON DELETE CASCADE
    );
  `);
  db.prepare(
    `INSERT OR IGNORE INTO knowledge_schema(singleton, version)
     VALUES (1, ?)`
  ).run(KNOWLEDGE_STORE_SCHEMA_VERSION);
}

export function readKnowledgeSchemaVersion(db: Database.Database): number | undefined {
  const row = db.prepare("SELECT version FROM knowledge_schema WHERE singleton = 1").get() as
    SchemaVersionRow | undefined;
  return row?.version;
}

export function knowledgeTableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as TableNameRow | undefined;
  return Boolean(row);
}

export function activateKnowledgeSnapshot(
  db: Database.Database,
  snapshot: CompiledKnowledgeSnapshotV1,
  createdAt: string
): void {
  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO knowledge_snapshots(
         snapshot_id, repository_key, source_fingerprint, snapshot_json, created_at
       ) VALUES (?, ?, ?, ?, ?)`
    ).run(
      snapshot.snapshotId,
      snapshot.repositoryKey,
      snapshot.sourceFingerprint,
      JSON.stringify(snapshot),
      createdAt
    );
    db.prepare(
      `INSERT INTO active_knowledge_snapshots(repository_key, snapshot_id)
       VALUES (?, ?)
       ON CONFLICT(repository_key) DO UPDATE SET snapshot_id = excluded.snapshot_id`
    ).run(snapshot.repositoryKey, snapshot.snapshotId);
  });
  transaction();
}

export function readActiveKnowledgeSnapshot(
  db: Database.Database,
  repositoryKey: string
): string | undefined {
  const row = db
    .prepare(
      `SELECT snapshots.snapshot_json
       FROM active_knowledge_snapshots active
       JOIN knowledge_snapshots snapshots ON snapshots.snapshot_id = active.snapshot_id
       WHERE active.repository_key = ?`
    )
    .get(repositoryKey) as SnapshotRow | undefined;
  return row?.snapshot_json;
}

export function discardKnowledgeRepository(db: Database.Database, repositoryKey: string): number {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM active_knowledge_snapshots WHERE repository_key = ?").run(
      repositoryKey
    );
    return db.prepare("DELETE FROM knowledge_snapshots WHERE repository_key = ?").run(repositoryKey)
      .changes;
  });
  return transaction();
}
