import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  buildKnowledgeContext,
  checkKnowledgeWorkspace,
  explainKnowledgeFrame,
  indexKnowledgeWorkspace,
  readKnowledgeWorkspace,
  type KnowledgeWorkspaceOptions,
} from "../../src/knowledge/index.js";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "lex-knowledge-workspace-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function markdown(title: string, body = "Observe the state transition."): string {
  return `<!-- lex:frame
id: repair-transition
type: probe
lifecycle: active
-->

## ${title}

${body}

<!-- lex:end -->`;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function workspace(
  title = "Initial observation",
  body?: string
): {
  readonly root: string;
  readonly sourcePath: string;
  readonly databasePath: string;
  readonly options: KnowledgeWorkspaceOptions;
} {
  const root = temporaryDirectory();
  const sourcePath = join(root, "docs", "knowledge.md");
  const databasePath = join(root, ".smartergpt", "lex", "knowledge.db");
  write(join(root, "lex.yaml"), "version: 1\nknowledge:\n  sources:\n    - docs/knowledge.md\n");
  write(sourcePath, markdown(title, body));
  return {
    root,
    sourcePath,
    databasePath,
    options: {
      projectRoot: root,
      repositoryKey: "example/repo",
      databasePath,
      revision: { commitSha: COMMIT, branch: "main", dirtyPaths: new Set() },
    },
  };
}

describe("Knowledge workspace operations", () => {
  test("check validates without creating or writing a store", () => {
    const fixture = workspace();
    const result = checkKnowledgeWorkspace(fixture.options);

    assert.equal(result.operation, "knowledge-check");
    assert.equal(result.recordCount, 1);
    assert.equal(result.databaseWrites, 0);
    assert.equal(existsSync(fixture.databasePath), false);
  });

  test("context reports an unindexed workspace without creating a store", () => {
    const fixture = workspace();
    const context = buildKnowledgeContext(fixture.options);

    assert.equal(context.snapshot.freshness, "unindexed");
    assert.deepEqual(context.records, []);
    assert.equal(existsSync(fixture.databasePath), false);
  });

  test("index aborts before store creation when inputs change between fingerprints", () => {
    const fixture = workspace();
    const before = readKnowledgeWorkspace(fixture.options);
    write(fixture.sourcePath, markdown("Changed during index"));
    const after = readKnowledgeWorkspace(fixture.options);
    const reads = [before, after];

    assert.throws(
      () =>
        indexKnowledgeWorkspace({
          ...fixture.options,
          readWorkspace: () => reads.shift()!,
        }),
      /inputs changed during indexing/
    );
    assert.equal(existsSync(fixture.databasePath), false);
  });

  test("context returns current bodies through a hard read-only bounded projection", () => {
    const fixture = workspace();
    const indexed = indexKnowledgeWorkspace({
      ...fixture.options,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });
    const context = buildKnowledgeContext({ ...fixture.options, query: "repair", maxBytes: 8_000 });

    assert.equal(context.snapshot.activeSnapshotId, indexed.snapshotId);
    assert.equal(context.snapshot.freshness, "current");
    assert.equal(context.records.length, 1);
    assert.equal(context.records[0].freshness, "current");
    assert.ok(context.records[0].whySelected.includes("query-match"));
    assert.equal(context.safety.contentTrust, "untrusted-project-data");
    assert.ok(context.budget.usedBytes <= context.budget.maxBytes);
    assert.equal(Buffer.byteLength(JSON.stringify(context), "utf8"), context.budget.usedBytes);
  });

  test("stale source content is never returned in preferred context", () => {
    const fixture = workspace("Before");
    indexKnowledgeWorkspace(fixture.options);
    write(fixture.sourcePath, markdown("After", "A stale body that must not be projected."));

    const context = buildKnowledgeContext(fixture.options);
    assert.equal(context.snapshot.freshness, "stale");
    assert.deepEqual(context.records, []);
    assert.ok(context.warnings.some((warning) => warning.includes("stored bodies were excluded")));
  });

  test("removed blocks make the snapshot stale and cannot leak stored bodies", () => {
    const fixture = workspace("Before removal");
    indexKnowledgeWorkspace(fixture.options);
    write(fixture.sourcePath, "# Ordinary Markdown\n\nThe block was removed.\n");

    const context = buildKnowledgeContext(fixture.options);
    assert.equal(context.snapshot.freshness, "stale");
    assert.deepEqual(context.records, []);
    const explained = explainKnowledgeFrame("repair-transition", fixture.options);
    assert.equal(explained.freshness, "missing");
    assert.equal(explained.stored?.anchor, "repair-transition");
    assert.equal(explained.current, null);
  });

  test("one byte budget deterministically omits records that do not fit", () => {
    const fixture = workspace("Oversized", "x".repeat(2_000));
    indexKnowledgeWorkspace(fixture.options);

    const context = buildKnowledgeContext({ ...fixture.options, maxBytes: 2_048 });
    assert.deepEqual(context.records, []);
    assert.equal(context.budget.maxBytes, 2_048);
    assert.equal(context.budget.omittedRecords, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(context), "utf8") <= context.budget.maxBytes);
  });

  test("explain preserves stored coordinates and locates the current ID after a file move", () => {
    const fixture = workspace();
    indexKnowledgeWorkspace(fixture.options);
    const movedPath = join(fixture.root, "notes", "moved.md");
    write(movedPath, markdown("Initial observation"));
    write(
      join(fixture.root, "lex.yaml"),
      "version: 1\nknowledge:\n  sources:\n    - notes/moved.md\n"
    );
    rmSync(fixture.sourcePath);

    const explained = explainKnowledgeFrame("repair-transition", fixture.options);
    assert.equal(explained.freshness, "stale");
    assert.equal(explained.stored?.path, "docs/knowledge.md");
    assert.equal(explained.current?.path, "notes/moved.md");
    assert.equal(explained.current?.anchor, "repair-transition");
  });
});
