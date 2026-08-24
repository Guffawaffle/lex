import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { resolveWslFixtureExecutionRoot } from "../../scripts/lex3-postgres-dogfood-canary.js";

const canarySource = readFileSync(
  new URL("../../scripts/lex3-postgres-dogfood-canary.ts", import.meta.url),
  "utf8"
);

describe("Lex 3 PostgreSQL dogfood canary host paths", () => {
  test("uses an absolute simulated POSIX root on Windows", () => {
    assert.equal(
      resolveWslFixtureExecutionRoot(
        "C:\\host-temp\\lex3-registry-canary\\wsl-repository",
        "win32"
      ),
      "/host-temp/lex3-registry-canary/wsl-repository"
    );
  });

  test("preserves the native absolute fixture root on POSIX", () => {
    assert.equal(
      resolveWslFixtureExecutionRoot("/tmp/lex3-registry-canary-host/wsl-repository", "linux"),
      "/tmp/lex3-registry-canary-host/wsl-repository"
    );
  });

  test("keeps the simulated WSL path evidence-only and cleans verified host temp roots", () => {
    assert.match(
      canarySource,
      /const registryRoot = verifiedHostTemporaryRoot\("lex3-registry-canary-"\)/
    );
    assert.match(
      canarySource,
      /const exportRoot = verifiedHostTemporaryRoot\("lex3-export-canary-"\)/
    );
    assert.equal(
      canarySource.match(/\bwslFixtureRoot\b/g)?.length,
      2,
      "the simulated POSIX root may only be declared and bound into execution-surface evidence"
    );
    assert.doesNotMatch(canarySource, /(?:mkdirSync|rmSync)\([^\n]*wslFixtureRoot/);
    assert.match(canarySource, /removeVerifiedHostTemporaryRoot\(registryRoot\)/);
    assert.match(canarySource, /removeVerifiedHostTemporaryRoot\(exportRoot\)/);
    assert.match(canarySource, /process\.chdir\(dirname\(registryRoot\)\)/);
    assert.match(canarySource, /process\.chdir\(originalWorkingDirectory\)/);
  });
});
