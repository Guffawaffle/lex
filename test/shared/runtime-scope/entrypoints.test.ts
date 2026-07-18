import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { MCPServer } from "../../../src/memory/mcp_server/server.js";
import { MemoryFrameStore } from "../../../src/memory/store/memory/index.js";
import { run } from "../../../src/shared/cli/index.js";
import { AXErrorException } from "../../../src/shared/errors/ax-error.js";
import {
  DIAGNOSTIC_CONTRACT_VERSION,
  type AuthorizedScopeV1,
  type BootstrapInputSnapshotV1,
  type CapabilityId,
  type ContentDigest,
  type DiagnosticEnvelopeV1,
  type InvocationContextV1,
  type RuntimeId,
  type TraceId,
  type TrustedRuntimeScopeBootstrapRequestV1,
  type TrustedRuntimeScopeBootstrapResultV1,
  type TrustedRuntimeScopeBootstrapV1,
} from "../../../src/shared/runtime-scope/index.js";

const FRAME_READ = "frame:read" as CapabilityId;
const FRAME_WRITE = "frame:write" as CapabilityId;

function fakeInvocationContext(): InvocationContextV1 {
  return {
    schemaVersion: 1,
    projectRoot: "/srv/lex",
    requestedWorkspace: { workspaceId: "workspace-lex" as never },
    repositoryEvidence: {
      schemaVersion: 1,
      canonicalRoot: "/srv/lex",
    },
    runtimeSurface: {
      schemaVersion: 1,
      executionSurfaceId: "surface-1" as never,
      registryInstanceId: "registry-1" as never,
      runtimeId: "runtime-1" as RuntimeId,
    },
  };
}

function fakeAuthorizedScope(capabilities: readonly CapabilityId[]): AuthorizedScopeV1 {
  return {
    schemaVersion: 1,
    grantId: "grant-1" as never,
    tenantId: "tenant-1" as never,
    workspaceId: "workspace-lex" as never,
    principalId: "principal-1" as never,
    capabilities,
    authorityVersion: "authority-v1" as never,
    scopeVersion: "scope-v1" as never,
    authorityDigest: "sha256:authority" as ContentDigest,
    verifiedAt: "2026-07-18T12:00:00.000Z",
  };
}

function fakeDiagnostics(request: TrustedRuntimeScopeBootstrapRequestV1): DiagnosticEnvelopeV1 {
  return {
    schemaVersion: DIAGNOSTIC_CONTRACT_VERSION,
    runtimeId: request.runtimeId,
    traceId: request.traceId,
    resolutionDigest: "sha256:resolution" as ContentDigest,
    decisions: [
      {
        code: "LEX_RUNTIME_SCOPE_RESOLVED",
        outcome: "accepted",
        summary: "Resolved.",
      },
    ],
    warnings: [],
    redactions: [{ field: "projectRoot", reason: "topology" }],
  };
}

function successfulBootstrap(seen: TrustedRuntimeScopeBootstrapRequestV1[]) {
  const bootstrap: TrustedRuntimeScopeBootstrapV1 = {
    async resolve(request): Promise<TrustedRuntimeScopeBootstrapResultV1> {
      seen.push(request);
      return {
        resolved: true,
        invocationContext: fakeInvocationContext(),
        authorizedScope: fakeAuthorizedScope(request.requestedCapabilities),
        ...(request.diagnosticRequest ? { diagnostics: fakeDiagnostics(request) } : {}),
      };
    },
  };
  return bootstrap;
}

function deniedBootstrap(seen: TrustedRuntimeScopeBootstrapRequestV1[]) {
  const bootstrap: TrustedRuntimeScopeBootstrapV1 = {
    async resolve(request): Promise<TrustedRuntimeScopeBootstrapResultV1> {
      seen.push(request);
      return {
        resolved: false,
        error: {
          code: "LEX_WORKSPACE_UNBOUND",
          message: "No trusted local workspace binding matched this invocation.",
        },
      };
    },
  };
  return bootstrap;
}

const invocationRequest = {
  schemaVersion: 1 as const,
  bootstrap: {
    schemaVersion: 1,
    cwd: "/srv/lex",
    argv: ["node", "lex"],
    allowedEnvironment: {},
    platform: "linux",
    executionSurface: {
      schemaVersion: 1,
      nativePlatform: "linux",
      kind: "linux-native",
      installationRef: "/usr/bin/node",
      evidenceDigest: "sha256:surface" as ContentDigest,
    },
    capturedAt: "2026-07-18T12:00:00.000Z",
  } as BootstrapInputSnapshotV1,
  runtimeId: "runtime-1" as RuntimeId,
  traceId: "trace-1" as TraceId,
};

describe("trusted runtime-scope entrypoint guards", () => {
  test("CLI resolves before dispatch and emits diagnostics only when requested", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    const emitted: DiagnosticEnvelopeV1[] = [];
    let resolved = false;

    await run(["node", "lex", "--diagnostic", "hints", "--list"], {
      runtimeScope: {
        bootstrap: successfulBootstrap(seen),
        request: invocationRequest,
        requestedCapabilities: [FRAME_READ],
        onResolved: () => {
          resolved = true;
        },
        emitDiagnostics: (diagnostics) => {
          emitted.push(diagnostics);
        },
      },
    });

    assert.equal(resolved, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.entrypoint, "cli");
    assert.deepEqual(seen[0]?.requestedCapabilities, [FRAME_READ]);
    assert.equal(seen[0]?.diagnosticRequest?.level, "summary");
    assert.equal(emitted.length, 1);
  });

  test("CLI denial prevents command dispatch with the stable scope error", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    await assert.rejects(
      () =>
        run(["node", "lex", "hints", "--list"], {
          runtimeScope: {
            bootstrap: deniedBootstrap(seen),
            request: invocationRequest,
            requestedCapabilities: [FRAME_READ],
            emitDiagnostics: () => {},
          },
        }),
      (error: unknown) =>
        error instanceof AXErrorException && error.axError.code === "LEX_WORKSPACE_UNBOUND"
    );
    assert.equal(seen.length, 1);
  });

  test("CLI diagnostic controls do not cross the passthrough boundary", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];

    await assert.rejects(
      () =>
        run(["node", "lex", "hints", "--", "--diagnostic", "--diagnostic-level=full"], {
          runtimeScope: {
            bootstrap: deniedBootstrap(seen),
            request: invocationRequest,
            requestedCapabilities: [FRAME_READ],
            emitDiagnostics: () => {},
          },
        }),
      (error: unknown) =>
        error instanceof AXErrorException && error.axError.code === "LEX_WORKSPACE_UNBOUND"
    );

    assert.equal(seen[0]?.diagnosticRequest, undefined);
  });

  test("MCP resolves per tool call and attaches opt-in diagnostics", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    const server = new MCPServer({
      frameStore: new MemoryFrameStore(),
      runtimeScope: {
        bootstrap: successfulBootstrap(seen),
        request: invocationRequest,
        requestedCapabilitiesForTool: (name) =>
          name === "frame_create" ? [FRAME_WRITE] : [FRAME_READ],
      },
    });
    try {
      const response = await server.handleRequest({
        method: "tools/call",
        params: {
          name: "frame_list",
          arguments: { diagnostics: "summary" },
        },
      });

      assert.equal(response.error, undefined);
      assert.ok(response.data?.diagnostics);
      assert.equal(seen[0]?.entrypoint, "mcp");
      assert.deepEqual(seen[0]?.requestedCapabilities, [FRAME_READ]);
      assert.equal(seen[0]?.diagnosticRequest?.level, "summary");

      const tools = await server.handleRequest({ method: "tools/list" });
      const listed = tools.tools as Array<{
        name: string;
        inputSchema: { properties: Record<string, unknown> };
      }>;
      assert.ok(listed.every((tool) => "diagnostics" in tool.inputSchema.properties));
    } finally {
      await server.close();
    }
  });

  test("MCP removes diagnostic controls before public tool validation", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    const server = new MCPServer({
      frameStore: new MemoryFrameStore(),
      runtimeScope: {
        bootstrap: successfulBootstrap(seen),
        request: invocationRequest,
        requestedCapabilitiesForTool: () => [FRAME_WRITE],
      },
    });
    try {
      const response = await server.handleRequest({
        method: "tools/call",
        params: {
          name: "frame_validate",
          arguments: {
            diagnostics: "summary",
            reference_point: "diagnostic-control-boundary",
            summary_caption: "Diagnostic metadata is not a Frame field",
            status_snapshot: { next_action: "none" },
            module_scope: ["runtime-scope"],
          },
        },
      });

      assert.equal(response.error, undefined);
      assert.ok(response.data?.diagnostics);
      const validated = response.data?.frame as Record<string, unknown> | undefined;
      assert.equal(validated?.diagnostics, undefined);
    } finally {
      await server.close();
    }
  });

  test("MCP denial blocks a mutating tool before the store is called", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    const store = new MemoryFrameStore();
    const server = new MCPServer({
      frameStore: store,
      runtimeScope: {
        bootstrap: deniedBootstrap(seen),
        request: invocationRequest,
        requestedCapabilitiesForTool: () => [FRAME_WRITE],
      },
    });
    try {
      const response = await server.handleRequest({
        method: "tools/call",
        params: {
          name: "frame_create",
          arguments: {
            reference_point: "must-not-write",
            summary_caption: "Denied before dispatch",
            status_snapshot: { next_action: "none" },
            module_scope: ["runtime-scope"],
          },
        },
      });

      assert.equal(response.error?.code, "LEX_WORKSPACE_UNBOUND");
      assert.equal(store.size(), 0);
      assert.equal(seen.length, 1);
    } finally {
      await server.close();
    }
  });
});
