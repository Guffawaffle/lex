import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { MCPServer } from "../../../src/memory/mcp_server/server.js";
import {
  MemoryFrameStore,
  MemoryScopedFrameStoreBackend,
} from "../../../src/memory/store/memory/index.js";
import {
  SCOPED_FRAME_STORE_ERROR_CODES,
  type FrameStore,
} from "../../../src/memory/store/index.js";
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
    assert.deepEqual(seen[0]?.requestedCapabilities, []);
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
    const backend = new MemoryScopedFrameStoreBackend();
    const server = new MCPServer({
      frameStore: new MemoryFrameStore(),
      frameStoreBinder: backend,
      runtimeScope: {
        bootstrap: successfulBootstrap(seen),
        request: invocationRequest,
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
      await backend.close();
    }
  });

  test("MCP removes diagnostic controls before public tool validation", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    const server = new MCPServer({
      frameStore: new MemoryFrameStore(),
      runtimeScope: {
        bootstrap: successfulBootstrap(seen),
        request: invocationRequest,
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
    const backend = new MemoryScopedFrameStoreBackend();
    const server = new MCPServer({
      frameStore: store,
      frameStoreBinder: backend,
      runtimeScope: {
        bootstrap: deniedBootstrap(seen),
        request: invocationRequest,
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
      await backend.close();
    }
  });

  test("CLI refuses Frame dispatch when trusted scope has no binder", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    await assert.rejects(
      () =>
        run(["node", "lex", "recall", "scope-required"], {
          runtimeScope: {
            bootstrap: successfulBootstrap(seen),
            request: invocationRequest,
            emitDiagnostics: () => {},
          },
        }),
      (error: unknown) =>
        error instanceof AXErrorException &&
        error.axError.code === SCOPED_FRAME_STORE_ERROR_CODES.INVALID_SCOPE
    );
    assert.equal(seen.length, 0);
  });

  test("CLI does not route legacy physical database administration through a normal binder", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    const backend = new MemoryScopedFrameStoreBackend();
    await assert.rejects(
      () =>
        run(["node", "lex", "db", "stats"], {
          runtimeScope: {
            bootstrap: successfulBootstrap(seen),
            request: invocationRequest,
            frameStoreBinder: backend,
            emitDiagnostics: () => {},
          },
        }),
      (error: unknown) =>
        error instanceof AXErrorException &&
        error.axError.code === SCOPED_FRAME_STORE_ERROR_CODES.INVALID_SCOPE
    );
    assert.equal(seen.length, 0);
    await backend.close();
  });

  test("MCP refuses Frame dispatch when trusted scope has no binder", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    const store = new MemoryFrameStore();
    const server = new MCPServer({
      frameStore: store,
      runtimeScope: {
        bootstrap: successfulBootstrap(seen),
        request: invocationRequest,
      },
    });
    try {
      const response = await server.handleRequest({
        method: "tools/call",
        params: { name: "frame_list", arguments: {} },
      });
      assert.equal(response.error?.code, SCOPED_FRAME_STORE_ERROR_CODES.INVALID_SCOPE);
      assert.equal(seen.length, 0);
      assert.equal(store.size(), 0);
    } finally {
      await server.close();
    }
  });

  test("MCP trusted-scope misconfiguration never eagerly opens the legacy store", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    const server = new MCPServer({
      runtimeScope: {
        bootstrap: successfulBootstrap(seen),
        request: invocationRequest,
      },
    });
    try {
      assert.equal((server as unknown as { frameStore?: FrameStore }).frameStore, undefined);
      const response = await server.handleRequest({
        method: "tools/call",
        params: {
          name: "frame_validate",
          arguments: {
            reference_point: "validation-needs-no-store",
            summary_caption: "No legacy initialization",
            status_snapshot: { next_action: "retain fail-closed startup" },
            module_scope: ["runtime-scope"],
          },
        },
      });
      assert.equal(response.error, undefined);
      assert.deepEqual(
        seen.map(({ requestedCapabilities }) => requestedCapabilities),
        [[]]
      );
    } finally {
      await server.close();
    }
  });

  test("MCP binds the resolved scope lexically without eagerly opening a legacy store", async () => {
    const seen: TrustedRuntimeScopeBootstrapRequestV1[] = [];
    const backend = new MemoryScopedFrameStoreBackend();
    const server = new MCPServer({
      frameStoreBinder: backend,
      runtimeScope: {
        bootstrap: successfulBootstrap(seen),
        request: invocationRequest,
      },
    });
    try {
      const created = await server.handleRequest({
        method: "tools/call",
        params: {
          name: "frame_create",
          arguments: {
            reference_point: "lexical-scope-handoff",
            summary_caption: "Bound after authorization",
            status_snapshot: { next_action: "verify isolated recall" },
            module_scope: ["memory/store"],
          },
        },
      });
      assert.equal(created.error, undefined);

      const listed = await server.handleRequest({
        method: "tools/call",
        params: { name: "frame_list", arguments: { limit: 10, format: "compact" } },
      });
      assert.equal(listed.error, undefined);
      assert.equal((listed.data?.frames as unknown[] | undefined)?.length, 1);
      assert.deepEqual(
        seen.map(({ requestedCapabilities }) => requestedCapabilities),
        [["frame:read", "frame:write"], ["frame:read"]]
      );
    } finally {
      await server.close();
      await backend.close();
    }
  });

  test("MCP idempotency responses cannot bleed across authorized workspaces", async () => {
    let workspace = "workspace-a";
    const bootstrap: TrustedRuntimeScopeBootstrapV1 = {
      async resolve(request) {
        return {
          resolved: true,
          invocationContext: fakeInvocationContext(),
          authorizedScope: {
            ...fakeAuthorizedScope(request.requestedCapabilities),
            workspaceId: workspace as never,
          },
        };
      },
    };
    const backend = new MemoryScopedFrameStoreBackend();
    const server = new MCPServer({
      frameStoreBinder: backend,
      runtimeScope: { bootstrap, request: invocationRequest },
    });
    const call = () =>
      server.handleRequest({
        method: "tools/call",
        params: {
          name: "frame_create",
          arguments: {
            request_id: "same-agent-retry-key",
            reference_point: "idempotency-scope",
            summary_caption: `Created in ${workspace}`,
            status_snapshot: { next_action: "verify scope partition" },
            module_scope: ["memory/store"],
          },
        },
      });
    try {
      const first = await call();
      workspace = "workspace-b";
      const second = await call();
      assert.equal(first.error, undefined);
      assert.equal(second.error, undefined);
      assert.notEqual(first.data?.frame_id, second.data?.frame_id);
    } finally {
      await server.close();
      await backend.close();
    }
  });
});
