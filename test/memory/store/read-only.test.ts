import { test } from "node:test";
import assert from "node:assert";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3-multiple-ciphers";
import {
  createDatabase,
  DATABASE_SCHEMA_VERSION,
  openDatabaseReadOnly,
  readStableDatabaseSnapshot,
  ReadOnlyDatabaseError,
} from "@app/memory/store/db.js";
import { SqliteFrameStore } from "@app/memory/store/sqlite/index.js";

function schemaVersion(dbPath: string): number {
  const snapshot = readFileSync(dbPath);
  if (snapshot[18] === 2 || snapshot[19] === 2) {
    snapshot[18] = 1;
    snapshot[19] = 1;
  }
  const db = new Database(snapshot);
  try {
    db.pragma("query_only = ON");
    const row = db.prepare("SELECT MAX(version) AS version FROM schema_version").get() as {
      version: number | null;
    };
    return row.version ?? 0;
  } finally {
    db.close();
  }
}

function filesystemSnapshot(dbPath: string): object {
  const directory = dirname(dbPath);
  return Object.fromEntries(
    readdirSync(directory)
      .sort()
      .map((entry) => {
        const path = join(directory, entry);
        const stat = statSync(path, { bigint: true });
        return [
          entry,
          {
            sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
            mode: stat.mode,
            mtimeNs: stat.mtimeNs,
          },
        ];
      })
  );
}

test("nominal driver read-only access can still create WAL sidecars", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-driver-read-only-regression-"));
  const dbPath = join(root, "memory.db");

  try {
    createDatabase(dbPath).close();
    assert.deepStrictEqual(readdirSync(root), ["memory.db"]);

    const nominallyReadOnly = new Database(dbPath, { readonly: true, fileMustExist: true });
    nominallyReadOnly.prepare("SELECT MAX(version) FROM schema_version").get();
    nominallyReadOnly.close();

    assert.deepStrictEqual(readdirSync(root).sort(), [
      "memory.db",
      "memory.db-shm",
      "memory.db-wal",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDatabaseReadOnly cannot write and leaves a current store byte-for-byte unchanged", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-current-"));
  const dbPath = join(root, "store", "memory.db");

  try {
    createDatabase(dbPath).close();
    const versionBefore = schemaVersion(dbPath);
    const filesBefore = filesystemSnapshot(dbPath);

    const db = openDatabaseReadOnly(dbPath);
    assert.strictEqual(db.pragma("query_only", { simple: true }), 1);
    assert.throws(() => db.prepare("CREATE TABLE forbidden_write (id TEXT)").run(), /readonly/i);
    db.close();

    assert.strictEqual(schemaVersion(dbPath), versionBefore);
    assert.strictEqual(versionBefore, DATABASE_SCHEMA_VERSION);
    assert.deepStrictEqual(filesystemSnapshot(dbPath), filesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SqliteFrameStore exposes read-only mode and retains its canonical source path", async () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-store-mode-"));
  const dbPath = join(root, "memory.db");

  try {
    createDatabase(dbPath).close();
    const filesBefore = filesystemSnapshot(dbPath);
    const store = new SqliteFrameStore(dbPath, { accessMode: "read-only" });

    assert.strictEqual(store.accessMode, "read-only");
    assert.strictEqual(store.databasePath, dbPath);
    assert.strictEqual(store.db.name, ":memory:");
    await assert.rejects(
      store.saveFrame({
        id: "forbidden-write",
        timestamp: "2026-07-14T00:00:00Z",
        branch: "main",
        module_scope: ["memory/store"],
        summary_caption: "This write must remain detached",
        reference_point: "read-only store write guard",
        status_snapshot: { next_action: "Do not persist" },
      }),
      /readonly/i
    );
    await store.close();

    assert.deepStrictEqual(filesystemSnapshot(dbPath), filesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDatabaseReadOnly does not create a missing store, parent, or sidecars", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-missing-"));
  const dbPath = join(root, "missing", "memory.db");
  const entriesBefore = readdirSync(root);

  try {
    assert.throws(
      () => openDatabaseReadOnly(dbPath),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_NOT_FOUND");
        return true;
      }
    );
    assert.strictEqual(existsSync(dirname(dbPath)), false);
    assert.deepStrictEqual(readdirSync(root), entriesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDatabaseReadOnly refuses an older store without migrating or changing files", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-old-"));
  const dbPath = join(root, "memory.db");

  try {
    const writable = createDatabase(dbPath);
    writable.prepare("DELETE FROM schema_version WHERE version = ?").run(DATABASE_SCHEMA_VERSION);
    writable.close();
    const filesBefore = filesystemSnapshot(dbPath);

    assert.throws(
      () => openDatabaseReadOnly(dbPath),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_REQUIRES_MIGRATION");
        assert.strictEqual(error.currentVersion, DATABASE_SCHEMA_VERSION - 1);
        return true;
      }
    );

    assert.strictEqual(schemaVersion(dbPath), DATABASE_SCHEMA_VERSION - 1);
    assert.deepStrictEqual(filesystemSnapshot(dbPath), filesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDatabaseReadOnly reports a newer store as incompatible without changing it", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-newer-"));
  const dbPath = join(root, "memory.db");

  try {
    const writable = createDatabase(dbPath);
    writable
      .prepare("INSERT INTO schema_version (version) VALUES (?)")
      .run(DATABASE_SCHEMA_VERSION + 1);
    writable.close();
    const filesBefore = filesystemSnapshot(dbPath);

    assert.throws(
      () => openDatabaseReadOnly(dbPath),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_INCOMPATIBLE");
        assert.strictEqual(error.currentVersion, DATABASE_SCHEMA_VERSION + 1);
        return true;
      }
    );

    assert.strictEqual(schemaVersion(dbPath), DATABASE_SCHEMA_VERSION + 1);
    assert.deepStrictEqual(filesystemSnapshot(dbPath), filesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDatabaseReadOnly refuses an active WAL instead of returning stale context", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-active-wal-"));
  const dbPath = join(root, "memory.db");
  let writable: Database.Database | undefined;

  try {
    writable = createDatabase(dbPath);
    writable.exec("CREATE TABLE active_writer_probe (id TEXT)");
    assert.ok(statSync(`${dbPath}-wal`).size > 32);
    const filesBefore = filesystemSnapshot(dbPath);

    assert.throws(
      () => openDatabaseReadOnly(dbPath),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_UNAVAILABLE");
        assert.match(error.message, /active SQLite journal/i);
        return true;
      }
    );

    assert.deepStrictEqual(filesystemSnapshot(dbPath), filesBefore);
  } finally {
    writable?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDatabaseReadOnly refuses an active rollback journal without changing it", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-active-journal-"));
  const dbPath = join(root, "memory.db");
  const journalPath = `${dbPath}-journal`;

  try {
    createDatabase(dbPath).close();
    writeFileSync(journalPath, "active rollback journal");
    const filesBefore = filesystemSnapshot(dbPath);

    assert.throws(
      () => openDatabaseReadOnly(dbPath),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_UNAVAILABLE");
        assert.match(error.message, /active SQLite journal/i);
        return true;
      }
    );

    assert.deepStrictEqual(filesystemSnapshot(dbPath), filesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stable snapshot capture fails closed when the source changes while being read", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-changing-source-"));
  const dbPath = join(root, "memory.db");

  try {
    createDatabase(dbPath).close();

    assert.throws(
      () =>
        readStableDatabaseSnapshot(dbPath, (path) => {
          const snapshot = readFileSync(path);
          appendFileSync(path, Buffer.from([0]));
          return snapshot;
        }),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_UNAVAILABLE");
        assert.match(error.message, /changed while.*captured/i);
        return true;
      }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stable snapshot capture fails closed when a journal appears while being read", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-changing-journal-"));
  const dbPath = join(root, "memory.db");

  try {
    createDatabase(dbPath).close();

    assert.throws(
      () =>
        readStableDatabaseSnapshot(dbPath, (path) => {
          const snapshot = readFileSync(path);
          writeFileSync(`${path}-wal`, "concurrent WAL");
          return snapshot;
        }),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_UNAVAILABLE");
        assert.match(error.message, /changed while.*captured/i);
        return true;
      }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDatabaseReadOnly reports missing schema metadata without changing the store", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-unversioned-"));
  const dbPath = join(root, "memory.db");

  try {
    const unversioned = new Database(dbPath);
    unversioned.exec("CREATE TABLE unrelated (id TEXT)");
    unversioned.close();
    const filesBefore = filesystemSnapshot(dbPath);

    assert.throws(
      () => openDatabaseReadOnly(dbPath),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_REQUIRES_MIGRATION");
        assert.strictEqual(error.currentVersion, 0);
        assert.match(error.message, /no schema version metadata/i);
        return true;
      }
    );

    assert.deepStrictEqual(filesystemSnapshot(dbPath), filesBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("openDatabaseReadOnly refuses encrypted-store access without changing the store", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-only-encrypted-"));
  const dbPath = join(root, "memory.db");
  const originalKey = process.env.LEX_DB_KEY;

  try {
    delete process.env.LEX_DB_KEY;
    createDatabase(dbPath).close();
    const filesBefore = filesystemSnapshot(dbPath);
    process.env.LEX_DB_KEY = "Read-Only-Test-Key@2026";

    assert.throws(
      () => openDatabaseReadOnly(dbPath),
      (error: unknown) => {
        assert.ok(error instanceof ReadOnlyDatabaseError);
        assert.strictEqual(error.code, "STORE_UNAVAILABLE");
        assert.match(error.message, /encrypted Lex stores cannot yet be opened/i);
        return true;
      }
    );

    assert.deepStrictEqual(filesystemSnapshot(dbPath), filesBefore);
  } finally {
    if (originalKey === undefined) {
      delete process.env.LEX_DB_KEY;
    } else {
      process.env.LEX_DB_KEY = originalKey;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("default writable construction still creates and initializes a store", async () => {
  const root = mkdtempSync(join(tmpdir(), "lex-read-write-default-"));
  const dbPath = join(root, "store", "memory.db");

  try {
    const store = new SqliteFrameStore(dbPath);

    assert.strictEqual(store.accessMode, "read-write");
    assert.strictEqual(store.databasePath, dbPath);
    assert.strictEqual(existsSync(dbPath), true);
    await store.close();

    assert.strictEqual(schemaVersion(dbPath), DATABASE_SCHEMA_VERSION);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
