import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  KnowledgeSnapshotStore,
  KnowledgeStoreError,
  compileKnowledgeSnapshot,
} from "../../src/knowledge/index.js";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "lex-knowledge-store-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function snapshot(title: string) {
  return compileKnowledgeSnapshot({
    repositoryKey: "example/repo",
    sources: [
      {
        path: "docs/probe.md",
        sourceLayer: "commit" as const,
        commitSha: COMMIT,
        content: `<!-- lex:frame
id: repair-transition
type: probe
lifecycle: active
-->

## ${title}

Observe the state transition.

<!-- lex:end -->`,
      },
    ],
  });
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("KnowledgeSnapshotStore", () => {
  test("atomically replaces the active coherent snapshot", () => {
    const databasePath = join(temporaryDirectory(), ".smartergpt", "lex", "knowledge.db");
    const store = new KnowledgeSnapshotStore(databasePath, "read-write");
    const first = snapshot("First observation");
    const second = snapshot("Second observation");

    store.activate(first, "2026-07-21T00:00:00.000Z");
    assert.equal(store.getActive("example/repo")?.snapshotId, first.snapshotId);
    store.activate(second, "2026-07-21T00:01:00.000Z");
    assert.equal(store.getActive("example/repo")?.snapshotId, second.snapshotId);
    assert.equal(store.getActive("example/repo")?.records[0].title, "Second observation");
    store.close();
  });

  test("hard read-only access leaves the database byte-for-byte unchanged", () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, "knowledge.db");
    const writer = new KnowledgeSnapshotStore(databasePath, "read-write");
    const compiled = snapshot("Read only");
    writer.activate(compiled);
    writer.close();

    const beforeDigest = sha256(databasePath);
    const beforeFiles = readdirSync(directory).sort();
    const reader = new KnowledgeSnapshotStore(databasePath, "read-only");
    assert.equal(reader.getActive("example/repo")?.snapshotId, compiled.snapshotId);
    assert.throws(
      () => reader.activate(compiled),
      (error: unknown) =>
        error instanceof KnowledgeStoreError && error.code === "KNOWLEDGE_STORE_READ_ONLY"
    );
    reader.close();

    assert.equal(sha256(databasePath), beforeDigest);
    assert.deepEqual(readdirSync(directory).sort(), beforeFiles);
  });

  test("discarding derived knowledge cannot affect an episodic store", () => {
    const directory = temporaryDirectory();
    const episodicPath = join(directory, "memory.db");
    const knowledgePath = join(directory, "knowledge.db");
    writeFileSync(episodicPath, "episodic continuity sentinel", "utf8");
    const episodicDigest = sha256(episodicPath);

    const store = new KnowledgeSnapshotStore(knowledgePath, "read-write");
    store.activate(snapshot("Disposable"));
    assert.equal(store.discardRepository("example/repo"), 1);
    assert.equal(store.getActive("example/repo"), null);
    store.close();

    assert.equal(sha256(episodicPath), episodicDigest);
    assert.equal(readFileSync(episodicPath, "utf8"), "episodic continuity sentinel");
  });

  test("read-only access does not create a missing knowledge store", () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, "missing", "knowledge.db");

    assert.throws(
      () => new KnowledgeSnapshotStore(databasePath, "read-only"),
      (error: unknown) =>
        error instanceof KnowledgeStoreError && error.code === "KNOWLEDGE_STORE_NOT_FOUND"
    );
    assert.deepEqual(readdirSync(directory), []);
  });
});
