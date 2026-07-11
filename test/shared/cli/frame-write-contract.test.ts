import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildFrameWriteContract,
  resolveModuleAttribution,
} from "@app/shared/cli/frame-write-contract.js";

test("policy-less module auto uses the canonical unscoped fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-write-contract-"));
  try {
    const contract = buildFrameWriteContract({ policy: null, projectRoot: root });
    const result = resolveModuleAttribution(["auto"], contract);

    assert.deepStrictEqual(result.modules, ["workspace/unscoped"]);
    assert.strictEqual(result.attribution.mode, "fallback");
    assert.strictEqual(contract.policy.state, "unavailable");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("module auto returns a bounded policy-backed inference receipt", () => {
  const root = mkdtempSync(join(tmpdir(), "lex-write-contract-"));
  try {
    const contract = buildFrameWriteContract({
      projectRoot: root,
      query: "finish authentication service",
      policy: {
        modules: {
          "services/auth": { owns_paths: ["src/auth/**"] },
          "ui/shell": { owns_paths: ["src/ui/**"] },
        },
      },
    });
    const result = resolveModuleAttribution(["auto"], contract);

    assert.deepStrictEqual(result.modules, ["services/auth"]);
    assert.strictEqual(result.attribution.mode, "inferred");
    assert.ok(contract.suggestions.length <= 5);
    assert.ok(result.attribution.evidence.some((item) => item.startsWith("intent:")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
