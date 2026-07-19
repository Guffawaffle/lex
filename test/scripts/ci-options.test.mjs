import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function runBash(script, args = [], options = {}) {
  return spawnSync("bash", ["-c", script, "bash", ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    ...options,
  });
}

const parseAndRun = `
source ./scripts/ci-options.sh
lex_ci_parse_options "$@" || exit $?
npm() { printf 'npm:%s\\n' "$*"; }
lex_ci_run_optional_audits
`;

test("default developer validation does not invoke Prettier", () => {
  const result = runBash(parseAndRun);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});

test("--pretty and --prettier are exact check-only aliases", () => {
  for (const alias of ["--pretty", "--prettier"]) {
    const result = runBash(parseAndRun, [alias]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Required validation completed OK/);
    assert.match(result.stdout, /Optional repository-wide Prettier audit \(check-only\)/);
    assert.equal(result.stdout.match(/^npm:run format:check$/gm)?.length, 1);
    assert.doesNotMatch(result.stdout, /npm:run format$/m);
    assert.doesNotMatch(result.stdout, /--write/);
  }
});

test("both aliases request only one Prettier audit", () => {
  const result = runBash(parseAndRun, ["--pretty", "--prettier"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.match(/^npm:run format:check$/gm)?.length, 1);
});

test("unknown developer-validation options fail fast with usage", () => {
  const result = runBash(parseAndRun, ["--rewrite"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown developer-validation option: --rewrite/);
  assert.match(result.stderr, /Usage: \.\/scripts\/ci\.sh \[--pretty\|--prettier\]/);
  assert.equal(result.stdout, "");
});

function withFakeDocker(operation) {
  const root = mkdtempSync(join(tmpdir(), "lex-ci-wrapper-"));
  const docker = join(root, "docker");
  const argumentsPath = join(root, "arguments");
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
if [[ "$1" == "image" ]]; then exit 0; fi
printf '%s\\0' "$@" > "$LEX_CI_DOCKER_ARGUMENTS"
`,
    "utf8"
  );
  chmodSync(docker, 0o755);
  try {
    operation({
      argumentsPath,
      environment: {
        ...process.env,
        PATH: `${root}${delimiter}${process.env.PATH}`,
        LEX_CI_DOCKER_ARGUMENTS: argumentsPath,
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function recordedArguments(path) {
  return readFileSync(path, "utf8").split("\0").filter(Boolean);
}

test("documented Docker wrappers forward validation aliases verbatim", () => {
  withFakeDocker(({ argumentsPath, environment }) => {
    const local = spawnSync("bash", ["./scripts/local-ci-run.sh", "--pretty", "--prettier"], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      encoding: "utf8",
    });
    assert.equal(local.status, 0, local.stderr);
    assert.deepEqual(recordedArguments(argumentsPath).slice(-3), [
      "./scripts/ci.sh",
      "--pretty",
      "--prettier",
    ]);

    const nonet = spawnSync("bash", ["./scripts/ci-nonet.sh", "lex-ci:test", "--prettier"], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      encoding: "utf8",
    });
    assert.equal(nonet.status, 0, nonet.stderr);
    const nonetArguments = recordedArguments(argumentsPath);
    assert.ok(nonetArguments.includes("lex-ci:test"));
    assert.deepEqual(nonetArguments.slice(-2), ["./scripts/ci.sh", "--prettier"]);
  });
});

test("npm local-ci scripts route through the supported Docker wrappers", () => {
  const packageJson = JSON.parse(readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["local-ci"], "./scripts/local-ci-run.sh");
  assert.equal(packageJson.scripts["local-ci:nonet"], "./scripts/ci-nonet.sh");
});
