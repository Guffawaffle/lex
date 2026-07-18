import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Command } from "commander";

import { MCP_TOOLS } from "../../../src/memory/mcp_server/tools.js";
import { createProgram } from "../../../src/shared/cli/index.js";
import {
  CANONICAL_MCP_TOOLS,
  MCP_TOOL_ALIASES,
  RUNTIME_OPERATION_CAPABILITIES,
  TRUSTED_CLI_OPERATIONS,
  TRUSTED_CLI_CONTROL_OPERATIONS,
  UnknownTrustedOperationError,
  capabilitiesForCliOperation,
  capabilitiesForCliInvocation,
  capabilitiesForMcpTool,
  canonicalMcpToolName,
  trustedCliOperationFromArgv,
  type TrustedCliOperation,
} from "../../../src/shared/runtime-scope/index.js";

function leafCommandPaths(command: Command, prefix: readonly string[] = []): string[] {
  return command.commands.flatMap((child) => {
    const path = [...prefix, child.name()];
    return child.commands.length > 0 ? leafCommandPaths(child, path) : [path.join(":")];
  });
}

describe("trusted operation capability drift gates", () => {
  test("maps every concrete Commander command exactly once", () => {
    const actualCommands = leafCommandPaths(createProgram()).sort();
    assert.deepEqual(
      actualCommands,
      TRUSTED_CLI_OPERATIONS.filter(
        (operation) => !TRUSTED_CLI_CONTROL_OPERATIONS.includes(operation as never)
      )
    );

    for (const command of actualCommands) {
      const tokens = command.split(":");
      const operation = trustedCliOperationFromArgv(["node", "lex", ...tokens]);
      assert.equal(operation, command);
      const capabilities = capabilitiesForCliOperation(operation);
      assert.equal(Object.isFrozen(capabilities), true);
      assert.equal(new Set(capabilities).size, capabilities.length);
    }

    assert.deepEqual(capabilitiesForCliOperation("hints"), []);
    assert.deepEqual(capabilitiesForCliInvocation(["node", "lex", "--help"]), []);
    assert.deepEqual(capabilitiesForCliInvocation(["node", "lex", "--version"]), []);
    assert.deepEqual(capabilitiesForCliOperation("policy:check"), []);
    assert.deepEqual(capabilitiesForCliOperation("remember"), [
      RUNTIME_OPERATION_CAPABILITIES.FRAME_READ,
      RUNTIME_OPERATION_CAPABILITIES.FRAME_WRITE,
    ]);
    assert.deepEqual(capabilitiesForCliInvocation(["node", "lex", "remember", "--dry-run"]), [
      RUNTIME_OPERATION_CAPABILITIES.FRAME_READ,
    ]);
    assert.deepEqual(capabilitiesForCliInvocation(["node", "lex", "dedupe", "--dry-run"]), [
      RUNTIME_OPERATION_CAPABILITIES.FRAME_READ,
    ]);
    assert.throws(
      () => trustedCliOperationFromArgv(["node", "lex", "future-command"]),
      UnknownTrustedOperationError
    );
  });

  test("maps every advertised MCP tool and every dispatch alias exactly once", () => {
    const advertised = MCP_TOOLS.map(({ name }) => name).sort();
    assert.deepEqual(advertised, [...CANONICAL_MCP_TOOLS]);

    for (const name of advertised) {
      assert.equal(canonicalMcpToolName(name), name);
      const capabilities = capabilitiesForMcpTool(name);
      assert.equal(Object.isFrozen(capabilities), true);
      assert.equal(new Set(capabilities).size, capabilities.length);
    }
    for (const [alias, canonical] of Object.entries(MCP_TOOL_ALIASES)) {
      assert.equal(canonicalMcpToolName(alias), canonical);
      assert.deepEqual(capabilitiesForMcpTool(alias), capabilitiesForMcpTool(canonical));
    }

    assert.deepEqual(capabilitiesForMcpTool("frame_validate"), []);
    assert.deepEqual(capabilitiesForMcpTool("help"), []);
    assert.throws(() => capabilitiesForMcpTool("future_tool"), UnknownTrustedOperationError);
  });

  test("keeps the public operation union synchronized with runtime values", () => {
    const compileTimeOperations: readonly TrustedCliOperation[] = TRUSTED_CLI_OPERATIONS;
    assert.equal(compileTimeOperations.length, new Set(compileTimeOperations).size);
  });
});
