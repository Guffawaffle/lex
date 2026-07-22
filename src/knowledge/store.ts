import Database from "better-sqlite3-multiple-ciphers";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDetachedDatabaseReadOnly } from "../memory/store/db.js";
import { KnowledgeFrameV1Schema } from "./types.js";
import type { CompiledKnowledgeSnapshotV1 } from "./compiler.js";

export const KNOWLEDGE_STORE_SCHEMA_VERSION = 1 as const;

export type KnowledgeStoreAccessMode = "read-only" | "read-write";
export type KnowledgeStoreErrorCode =
  | "KNOWLEDGE_STORE_NOT_FOUND"
  | "KNOWLEDGE_STORE_INCOMPATIBLE"
  | "KNOWLEDGE_STORE_READ_ONLY"
  | "KNOWLEDGE_STORE_UNAVAILABLE";

export class KnowledgeStoreError extends Error {
  constructor(
    public readonly code: KnowledgeStoreErrorCode,
    message: string
  ) {
    super(message);
    this.name = "KnowledgeStoreError";
  }
}

interface SchemaVersionRow {
  version: number;
}

interface SnapshotRow {
  snapshot_json: string;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_schema (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      version INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO knowledge_schema(singleton, version)
    VALUES (1, ${KNOWLEDGE_STORE_SCHEMA_VERSION});

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
}

function validateSchema(db: Database.Database): void {
  try {
    const row = db.prepare("SELECT version FROM knowledge_schema WHERE singleton = 1").get() as
      SchemaVersionRow | undefined;
    if (row?.version !== KNOWLEDGE_STORE_SCHEMA_VERSION) {
      throw new KnowledgeStoreError(
        "KNOWLEDGE_STORE_INCOMPATIBLE",
        `Knowledge store schema ${String(row?.version ?? "missing")} is incompatible; expected ${KNOWLEDGE_STORE_SCHEMA_VERSION}.`
      );
    }
    for (const table of ["knowledge_snapshots", "active_knowledge_snapshots"]) {
      const found = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      if (!found) {
        throw new KnowledgeStoreError(
          "KNOWLEDGE_STORE_INCOMPATIBLE",
          `Knowledge store is missing required table ${table}.`
        );
      }
    }
  } catch (error) {
    if (error instanceof KnowledgeStoreError) throw error;
    throw new KnowledgeStoreError(
      "KNOWLEDGE_STORE_INCOMPATIBLE",
      `Knowledge store schema could not be validated: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function parseSnapshot(value: string): CompiledKnowledgeSnapshotV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new KnowledgeStoreError(
      "KNOWLEDGE_STORE_INCOMPATIBLE",
      `Stored knowledge snapshot is invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new KnowledgeStoreError(
      "KNOWLEDGE_STORE_INCOMPATIBLE",
      "Stored knowledge snapshot is not an object."
    );
  }
  const snapshot = parsed as Partial<CompiledKnowledgeSnapshotV1>;
  if (
    snapshot.schemaVersion !== 1 ||
    typeof snapshot.snapshotId !== "string" ||
    typeof snapshot.repositoryKey !== "string" ||
    typeof snapshot.compilerVersion !== "string" ||
    typeof snapshot.configurationDigest !== "string" ||
    typeof snapshot.sourceFingerprint !== "string" ||
    !Array.isArray(snapshot.records)
  ) {
    throw new KnowledgeStoreError(
      "KNOWLEDGE_STORE_INCOMPATIBLE",
      "Stored knowledge snapshot does not satisfy the v1 envelope."
    );
  }
  try {
    snapshot.records.forEach((record) => KnowledgeFrameV1Schema.parse(record));
  } catch (error) {
    throw new KnowledgeStoreError(
      "KNOWLEDGE_STORE_INCOMPATIBLE",
      `Stored KnowledgeFrame is invalid: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return snapshot as CompiledKnowledgeSnapshotV1;
}

/**
 * Dedicated, disposable KnowledgeFrame snapshot store.
 *
 * Read-only mode snapshots the file into a query-only in-memory connection so
 * reads cannot create SQLite sidecars or mutate the source database.
 */
export class KnowledgeSnapshotStore {
  private readonly db: Database.Database;
  private closed = false;

  constructor(
    public readonly databasePath: string,
    public readonly accessMode: KnowledgeStoreAccessMode = "read-only"
  ) {
    try {
      if (accessMode === "read-only") {
        this.db = openDetachedDatabaseReadOnly(databasePath);
        validateSchema(this.db);
      } else {
        mkdirSync(dirname(databasePath), { recursive: true });
        this.db = new Database(databasePath);
        this.db.pragma("foreign_keys = ON");
        this.db.pragma("journal_mode = WAL");
        initializeSchema(this.db);
        validateSchema(this.db);
      }
    } catch (error) {
      if (error instanceof KnowledgeStoreError) throw error;
      const code =
        error instanceof Error && "code" in error && error.code === "STORE_NOT_FOUND"
          ? "KNOWLEDGE_STORE_NOT_FOUND"
          : "KNOWLEDGE_STORE_UNAVAILABLE";
      throw new KnowledgeStoreError(
        code,
        `Knowledge store could not be opened: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  activate(snapshot: CompiledKnowledgeSnapshotV1, createdAt = new Date().toISOString()): void {
    this.requireWritable();
    parseSnapshot(JSON.stringify(snapshot));
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO knowledge_snapshots(
             snapshot_id, repository_key, source_fingerprint, snapshot_json, created_at
           ) VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          snapshot.snapshotId,
          snapshot.repositoryKey,
          snapshot.sourceFingerprint,
          JSON.stringify(snapshot),
          createdAt
        );
      this.db
        .prepare(
          `INSERT INTO active_knowledge_snapshots(repository_key, snapshot_id)
           VALUES (?, ?)
           ON CONFLICT(repository_key) DO UPDATE SET snapshot_id = excluded.snapshot_id`
        )
        .run(snapshot.repositoryKey, snapshot.snapshotId);
    });
    transaction();
  }

  getActive(repositoryKey: string): CompiledKnowledgeSnapshotV1 | null {
    this.requireOpen();
    const row = this.db
      .prepare(
        `SELECT snapshots.snapshot_json
         FROM active_knowledge_snapshots active
         JOIN knowledge_snapshots snapshots ON snapshots.snapshot_id = active.snapshot_id
         WHERE active.repository_key = ?`
      )
      .get(repositoryKey) as SnapshotRow | undefined;
    return row ? parseSnapshot(row.snapshot_json) : null;
  }

  discardRepository(repositoryKey: string): number {
    this.requireWritable();
    const transaction = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM active_knowledge_snapshots WHERE repository_key = ?")
        .run(repositoryKey);
      return this.db
        .prepare("DELETE FROM knowledge_snapshots WHERE repository_key = ?")
        .run(repositoryKey).changes;
    });
    return transaction();
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }

  private requireOpen(): void {
    if (this.closed) {
      throw new KnowledgeStoreError("KNOWLEDGE_STORE_UNAVAILABLE", "Knowledge store is closed.");
    }
  }

  private requireWritable(): void {
    this.requireOpen();
    if (this.accessMode === "read-only") {
      throw new KnowledgeStoreError(
        "KNOWLEDGE_STORE_READ_ONLY",
        "Knowledge store mutation requires explicit read-write access."
      );
    }
  }
}
