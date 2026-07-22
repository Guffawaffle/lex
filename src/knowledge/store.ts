import Database from "better-sqlite3-multiple-ciphers";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDetachedDatabaseReadOnly } from "../memory/store/db.js";
import { KnowledgeFrameV1Schema } from "./types.js";
import {
  KNOWLEDGE_STORE_SCHEMA_VERSION,
  activateKnowledgeSnapshot,
  discardKnowledgeRepository,
  initializeKnowledgeSchema,
  knowledgeTableExists,
  readActiveKnowledgeSnapshot,
  readKnowledgeSchemaVersion,
} from "./store-queries.js";
import type { CompiledKnowledgeSnapshotV1 } from "./compiler.js";

export { KNOWLEDGE_STORE_SCHEMA_VERSION } from "./store-queries.js";

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

function validateSchema(db: Database.Database): void {
  try {
    const version = readKnowledgeSchemaVersion(db);
    if (version !== KNOWLEDGE_STORE_SCHEMA_VERSION) {
      throw new KnowledgeStoreError(
        "KNOWLEDGE_STORE_INCOMPATIBLE",
        `Knowledge store schema ${String(version ?? "missing")} is incompatible; expected ${KNOWLEDGE_STORE_SCHEMA_VERSION}.`
      );
    }
    for (const table of ["knowledge_snapshots", "active_knowledge_snapshots"]) {
      if (!knowledgeTableExists(db, table)) {
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
        initializeKnowledgeSchema(this.db);
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
    activateKnowledgeSnapshot(this.db, snapshot, createdAt);
  }

  getActive(repositoryKey: string): CompiledKnowledgeSnapshotV1 | null {
    this.requireOpen();
    const snapshotJson = readActiveKnowledgeSnapshot(this.db, repositoryKey);
    return snapshotJson ? parseSnapshot(snapshotJson) : null;
  }

  discardRepository(repositoryKey: string): number {
    this.requireWritable();
    return discardKnowledgeRepository(this.db, repositoryKey);
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
