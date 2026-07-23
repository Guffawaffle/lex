import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const legacyEntrypoint = fileURLToPath(
  new URL("../../../src/memory/mcp_server/frame-mcp.mjs", import.meta.url)
);
const legacyLauncher = fileURLToPath(new URL("../../../lex-launcher.sh", import.meta.url));

for (const [label, command, args] of [
  ["module entrypoint", process.execPath, [legacyEntrypoint]],
  ["shell launcher", "bash", [legacyLauncher]],
]) {
  test(`legacy MCP ${label} fails closed with canonical migration guidance`, () => {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 5_000,
    });

    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /LEX_MCP_LEGACY_ENTRYPOINT_REMOVED/);
    assert.match(result.stderr, /Lex intentionally refused to start/);
    assert.match(result.stderr, /@smartergpt\/lex-mcp/);
    assert.match(result.stderr, /Preserve the existing Lex environment/);
    assert.match(result.stderr, /fail-closed safety migration/);
    assert.match(result.stderr, /not a Frame-store or data-loss error/);
  });
}
