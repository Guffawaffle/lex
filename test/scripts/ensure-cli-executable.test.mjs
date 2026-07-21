import assert from "node:assert/strict";
import { test } from "node:test";

import { ensureCliExecutable } from "../../scripts/ensure-cli-executable.mjs";

test("the postbuild check skips the POSIX chmod operation on Windows", async () => {
  const calls = [];
  const result = await ensureCliExecutable({
    baseDir: "C:/lex",
    platform: "win32",
    operations: {
      access: async (path) => calls.push(["access", path]),
      chmod: async (path, mode) => calls.push(["chmod", path, mode]),
    },
  });

  assert.equal(result.chmodApplied, false);
  assert.deepEqual(calls, [["access", result.cliPath]]);
});

test("the postbuild check preserves executable permissions on POSIX", async () => {
  const calls = [];
  const result = await ensureCliExecutable({
    baseDir: "/work/lex",
    platform: "linux",
    operations: {
      access: async (path) => calls.push(["access", path]),
      chmod: async (path, mode) => calls.push(["chmod", path, mode]),
    },
  });

  assert.equal(result.chmodApplied, true);
  assert.deepEqual(calls, [
    ["access", result.cliPath],
    ["chmod", result.cliPath, 0o755],
  ]);
});

test("the postbuild check fails when the built CLI artifact is missing", async () => {
  await assert.rejects(
    ensureCliExecutable({
      operations: {
        access: async () => {
          throw new Error("missing CLI artifact");
        },
        chmod: async () => {},
      },
    }),
    /missing CLI artifact/
  );
});
