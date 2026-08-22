import assert from "node:assert/strict";
import test from "node:test";

import { resolveNpmInvocation } from "../../scripts/run-npm.mjs";

test("npm invocation never routes arguments through a command shell", () => {
  const invocation = resolveNpmInvocation();
  assert.equal(typeof invocation.command, "string");
  assert.ok(Array.isArray(invocation.prefixArgs));
  assert.equal(Object.hasOwn(invocation, "shell"), false);
});
