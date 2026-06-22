import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectAxfBearings, formatAxfBearingsText } from "@app/shared/cli/axf-bearings.js";

function withWorkspaceEnvCleared<T>(fn: () => T): T {
  const originalWorkspaceRoot = process.env.LEX_WORKSPACE_ROOT;
  const originalAppRoot = process.env.LEX_APP_ROOT;
  delete process.env.LEX_WORKSPACE_ROOT;
  delete process.env.LEX_APP_ROOT;

  try {
    return fn();
  } finally {
    if (originalWorkspaceRoot === undefined) {
      delete process.env.LEX_WORKSPACE_ROOT;
    } else {
      process.env.LEX_WORKSPACE_ROOT = originalWorkspaceRoot;
    }

    if (originalAppRoot === undefined) {
      delete process.env.LEX_APP_ROOT;
    } else {
      process.env.LEX_APP_ROOT = originalAppRoot;
    }
  }
}

test("collectAxfBearings reports observed and inferred state without a git repo", () => {
  const repo = mkdtempSync(join(tmpdir(), "lex-axf-bearings-nongit-"));
  try {
    writeFileSync(join(repo, "README.md"), "# Test repo\n");
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify(
        {
          name: "test-repo",
          scripts: {
            build: "tsc -b",
            test: "node --test",
            "lint:fix": "eslint . --fix",
          },
        },
        null,
        2
      )
    );

    const report = withWorkspaceEnvCleared(() =>
      collectAxfBearings({ startPath: repo, maxStatus: 5 })
    );
    const text = formatAxfBearingsText(report);

    assert.strictEqual(report.observed.cwd.value, repo);
    assert.strictEqual(report.observed.workspaceRoot.value, repo);
    assert.strictEqual(report.observed.git.root.value, null);
    assert.strictEqual(report.observed.git.status.clean, null);
    assert.strictEqual(report.inferred.inGitRepository, false);
    assert.strictEqual(report.inferred.dirtyWorktree, null);
    assert.strictEqual(report.inferred.guidanceAvailable, true);
    assert.strictEqual(report.observed.tool.axf.surface.value, "bearings");
    assert.strictEqual(report.observed.tool.axf.schemaVersion.value, "1.0.0");
    assert.strictEqual("testCommands" in report.inferred, false);
    assert.strictEqual("buildCommands" in report.inferred, false);
    assert.strictEqual("hint" in report, false);
    assert.match(text, /Observed:/);
    assert.match(text, /Inferred:/);
    assert.match(text, /tool: lex .*; axf bearings schema 1\.0\.0/);
    assert.match(text, /guidance: 1 files observed; key: README\.md/);
    assert.doesNotMatch(text, /package scripts:/);
    assert.doesNotMatch(text, /likely test commands:/);
    assert.doesNotMatch(text, /authority: privacy=/);
    assert.doesNotMatch(text, /Hint:/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("collectAxfBearings summarizes dirty git status without requiring a commit", () => {
  const gitAvailable = spawnSync("git", ["--version"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (gitAvailable.status !== 0) {
    return;
  }

  const repo = mkdtempSync(join(tmpdir(), "lex-axf-bearings-git-"));
  try {
    const init = spawnSync("git", ["init"], {
      cwd: repo,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.strictEqual(init.status, 0, init.stderr);

    writeFileSync(join(repo, "README.md"), "# Test repo\n");
    writeFileSync(join(repo, "untracked.txt"), "dirty\n");

    const report = withWorkspaceEnvCleared(() =>
      collectAxfBearings({ startPath: repo, maxStatus: 1 })
    );

    assert.strictEqual(report.observed.git.root.value, repo);
    assert.strictEqual(report.inferred.inGitRepository, true);
    assert.strictEqual(report.observed.git.status.clean, false);
    assert.ok(report.observed.git.status.counts.untracked >= 1);
    assert.strictEqual(report.observed.git.status.entries.length, 1);
    assert.strictEqual(report.observed.git.status.truncated, true);

    const text = formatAxfBearingsText(report);
    assert.match(text, /dirty \d+ changes?/);
    assert.doesNotMatch(text, /showing \d+\/\d+/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
