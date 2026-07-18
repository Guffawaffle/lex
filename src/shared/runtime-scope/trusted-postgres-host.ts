import type { Pool } from "pg";

import type { DiagnosticEnvelopeV1 } from "./diagnostics.js";
import type { AuthorizedScopeV1 } from "./runtime.js";
import {
  createTrustedRuntimeScopeEntrypointGuard,
  type RuntimeScopeRegistryFactoryV1,
  type TrustedProcessCaptureV1,
  type TrustedRuntimeScopeEntrypointGuardV1,
} from "./bootstrap.js";
import {
  NodeRuntimeScopeDiscoveryAdapter,
  type NativeGitEvidenceProviderV1,
  type TrustedRuntimeSelectionProviderV1,
} from "./discovery.js";
import type { RuntimeId, TraceId } from "./ids.js";
import { PostgresAuthorityDirectory } from "./postgres-authority.js";
import {
  WORKSPACE_ADMIN_CONTRACT_VERSION,
  WorkspaceBindingAdminService,
  type WorkspaceAdminInvocationV1,
  type WorkspaceBindingAdminServiceV1,
} from "./workspace-admin.js";

/** Minimal cross-project contract required at the trusted composition boundary. */
export interface TrustedCanonicalScopedStoreV1 {
  readonly authorizedScope: AuthorizedScopeV1;
  close(): Promise<void>;
}

/**
 * Generic here avoids a runtime-scope -> memory-store project cycle. Concrete
 * CLI and MCP composition still requires their full ScopedFrameStoreBinder.
 */
export interface TrustedCanonicalFrameStoreBinderV1<
  BoundStore extends TrustedCanonicalScopedStoreV1 = TrustedCanonicalScopedStoreV1,
> {
  bind(scope: AuthorizedScopeV1): BoundStore;
}

export interface PostgresTrustedRuntimeHostOptionsV1<
  Binder extends TrustedCanonicalFrameStoreBinderV1,
> {
  /** Read-only runtime Pool. It must not be the authority administration Pool. */
  readonly authorityPool: Pool;
  /** Explicit trusted PostgreSQL schema containing the canonical authority. */
  readonly authoritySchema: string;
  /** Trusted authentication/workspace selection owned by the host or secret broker. */
  readonly selection: TrustedRuntimeSelectionProviderV1;
  /** Scope-bound runtime FrameStore; never an unscoped compatibility store. */
  readonly frameStoreBinder: Binder;
  readonly process: TrustedProcessCaptureV1;
  readonly runtimeId: RuntimeId;
  readonly traceId: TraceId;
  readonly emitDiagnostics: (diagnostics: DiagnosticEnvelopeV1) => void | Promise<void>;
  readonly registryFactory?: RuntimeScopeRegistryFactoryV1;
  readonly git?: NativeGitEvidenceProviderV1;
}

export interface PostgresTrustedRuntimeHostV1<Binder extends TrustedCanonicalFrameStoreBinderV1> {
  readonly authorityDirectory: PostgresAuthorityDirectory;
  /** Structurally assignable to CliRunOptionsV1 without ad hoc wiring. */
  readonly cli: Readonly<{
    readonly runtimeScope: TrustedRuntimeScopeEntrypointGuardV1 &
      Readonly<{
        readonly frameStoreBinder: Binder;
        readonly emitDiagnostics: (diagnostics: DiagnosticEnvelopeV1) => void | Promise<void>;
      }>;
    readonly workspaceAdmin: Readonly<{
      readonly service: WorkspaceBindingAdminServiceV1;
      readonly invocation: WorkspaceAdminInvocationV1;
    }>;
  }>;
  /** Structurally assignable to MCPServerOptions without a legacy store. */
  readonly mcp: Readonly<{
    readonly runtimeScope: TrustedRuntimeScopeEntrypointGuardV1;
    readonly frameStoreBinder: Binder;
  }>;
}

/**
 * Canonical explicit composition used by both CLI and MCP hosts.
 *
 * Pools, authentication selection, IDs, and the store binder cross this
 * boundary as constructor inputs. The factory never reads process.env, creates
 * a credential, or turns a repository declaration into authority.
 */
export function createPostgresTrustedRuntimeHost<Binder extends TrustedCanonicalFrameStoreBinderV1>(
  options: PostgresTrustedRuntimeHostOptionsV1<Binder>
): PostgresTrustedRuntimeHostV1<Binder> {
  const authorityDirectory = new PostgresAuthorityDirectory(options.authorityPool, {
    schema: options.authoritySchema,
  });
  const discovery = new NodeRuntimeScopeDiscoveryAdapter({
    selection: options.selection,
    ...(options.git ? { git: options.git } : {}),
  });
  const runtimeScope = createTrustedRuntimeScopeEntrypointGuard({
    authorityDirectory,
    discovery,
    process: options.process,
    runtimeId: options.runtimeId,
    traceId: options.traceId,
    ...(options.registryFactory ? { registryFactory: options.registryFactory } : {}),
  });
  const workspaceAdmin = Object.freeze({
    service: new WorkspaceBindingAdminService({ authorityDirectory, discovery }),
    invocation: Object.freeze({
      schemaVersion: WORKSPACE_ADMIN_CONTRACT_VERSION,
      entrypoint: "cli" as const,
      bootstrap: runtimeScope.request.bootstrap,
    }),
  });
  return Object.freeze({
    authorityDirectory,
    cli: Object.freeze({
      runtimeScope: Object.freeze({
        ...runtimeScope,
        frameStoreBinder: options.frameStoreBinder,
        emitDiagnostics: options.emitDiagnostics,
      }),
      workspaceAdmin,
    }),
    mcp: Object.freeze({ runtimeScope, frameStoreBinder: options.frameStoreBinder }),
  });
}
