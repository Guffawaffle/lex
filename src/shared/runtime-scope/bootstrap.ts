import { createHash } from "node:crypto";

import type { WorkspaceSelectorV1 } from "./authority.js";
import type { AuthorityDirectory, WorkspaceAuthorizationDecisionV1 } from "./authority.js";
import {
  LOCAL_BINDING_CONTRACT_VERSION,
  type LocalBindingRegistry,
  type RepositoryDeclarationV1,
  type RepositoryInstanceEvidenceV1,
} from "./bindings.js";
import {
  DIAGNOSTIC_CONTRACT_VERSION,
  type DiagnosticEnvelopeV1,
  type DiagnosticRequestV1,
  type DiagnosticSection,
} from "./diagnostics.js";
import type { AuthenticationRef, CapabilityId, ContentDigest, RuntimeId, TraceId } from "./ids.js";
import { SqliteLocalBindingRegistry, type OpenLocalRegistryOptionsV1 } from "./registry.js";
import {
  resolveRuntimeScope,
  runtimeScopeFailureFromRegistryError,
  type RuntimeScopeResolutionErrorV1,
  type RuntimeScopeResolutionResultV1,
} from "./resolver.js";
import type { SourceRevisionEvidenceV1 } from "./runtime.js";
import {
  RUNTIME_SCOPE_IMPLEMENTATION_VERSION,
  detectExecutionSurface,
  normalizeExecutionSurfacePath,
  resolveLocalRegistryLocation,
  type BootstrapInputSnapshotV1,
  type ResolvedRegistryLocationV1,
} from "./surface.js";

export const TRUSTED_RUNTIME_BOOTSTRAP_VERSION = 1 as const;
export const RUNTIME_DIAGNOSTIC_CAPABILITY = "runtime:diagnose" as CapabilityId;

export type TrustedRuntimeEntrypoint = "cli" | "mcp";
export type RuntimeAuthorityMode = "shared" | "local-offline";

/**
 * The only environment names the trusted runtime-scope capture boundary retains.
 * These values may locate configuration or native state. They never mint authority.
 */
export const RUNTIME_SCOPE_COMPATIBILITY_ENVIRONMENT = Object.freeze([
  "HOME",
  "USERPROFILE",
  "LOCALAPPDATA",
  "XDG_STATE_HOME",
  "WSL_DISTRO_NAME",
  "WSL_INTEROP",
  "LEX_WORKSPACE_ROOT",
  "LEX_APP_ROOT",
] as const);

export interface TrustedProcessCaptureV1 {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly installationRef: string;
  readonly capturedAt: string;
}

export interface RuntimeScopeDiscoveryV1 {
  readonly schemaVersion: typeof TRUSTED_RUNTIME_BOOTSTRAP_VERSION;
  readonly projectRoot: string;
  readonly authenticationRef: AuthenticationRef;
  readonly requestedWorkspace: WorkspaceSelectorV1;
  readonly repositoryDeclaration?: RepositoryDeclarationV1;
  readonly repositoryEvidence: RepositoryInstanceEvidenceV1;
  readonly authorityMode: RuntimeAuthorityMode;
  readonly authoritySource: string;
  readonly authorityCacheExpiresAt: string;
  readonly sourceRevision?: SourceRevisionEvidenceV1;
}

export interface RuntimeScopeDiscoveryAdapterV1 {
  discover(request: {
    readonly entrypoint: TrustedRuntimeEntrypoint;
    readonly bootstrap: BootstrapInputSnapshotV1;
  }): Promise<RuntimeScopeDiscoveryV1>;
}

export interface RuntimeScopeRegistryHandleV1 {
  readonly registry: LocalBindingRegistry;
  close(): void;
}

export interface RuntimeScopeRegistryFactoryV1 {
  openReadOnly(options: OpenLocalRegistryOptionsV1): RuntimeScopeRegistryHandleV1;
}

export interface TrustedRuntimeScopeBootstrapDependenciesV1 {
  readonly authorityDirectory: AuthorityDirectory;
  readonly discovery: RuntimeScopeDiscoveryAdapterV1;
  readonly registryFactory?: RuntimeScopeRegistryFactoryV1;
}

export interface TrustedRuntimeScopeBootstrapRequestV1 {
  readonly schemaVersion: typeof TRUSTED_RUNTIME_BOOTSTRAP_VERSION;
  readonly entrypoint: TrustedRuntimeEntrypoint;
  readonly bootstrap: BootstrapInputSnapshotV1;
  readonly runtimeId: RuntimeId;
  readonly traceId: TraceId;
  readonly requestedCapabilities: readonly CapabilityId[];
  readonly diagnosticRequest?: DiagnosticRequestV1;
}

export type TrustedRuntimeScopeBootstrapResultV1 =
  | {
      readonly resolved: true;
      readonly invocationContext: Extract<
        RuntimeScopeResolutionResultV1,
        { readonly resolved: true }
      >["invocationContext"];
      readonly authorizedScope: Extract<
        RuntimeScopeResolutionResultV1,
        { readonly resolved: true }
      >["authorizedScope"];
      readonly diagnostics?: DiagnosticEnvelopeV1;
    }
  | {
      readonly resolved: false;
      readonly error: RuntimeScopeResolutionErrorV1;
      readonly diagnostics?: DiagnosticEnvelopeV1;
    };

export interface TrustedRuntimeScopeBootstrapV1 {
  resolve(
    request: TrustedRuntimeScopeBootstrapRequestV1
  ): Promise<TrustedRuntimeScopeBootstrapResultV1>;
}

export type TrustedRuntimeScopeInvocationRequestV1 = Omit<
  TrustedRuntimeScopeBootstrapRequestV1,
  "entrypoint" | "requestedCapabilities" | "diagnosticRequest"
>;

/** Shared integration seam consumed by both the CLI runner and MCP server. */
export interface TrustedRuntimeScopeEntrypointGuardV1 {
  readonly bootstrap: TrustedRuntimeScopeBootstrapV1;
  readonly request: TrustedRuntimeScopeInvocationRequestV1;
}

export interface TrustedRuntimeScopeEntrypointGuardOptionsV1 extends TrustedRuntimeScopeBootstrapDependenciesV1 {
  readonly process: TrustedProcessCaptureV1;
  readonly runtimeId: RuntimeId;
  readonly traceId: TraceId;
}

/**
 * Canonical host wiring shared by CLI and MCP. Hosts inject authority and
 * selection once; neither entrypoint reconstructs ambient authority state.
 */
export function createTrustedRuntimeScopeEntrypointGuard(
  options: TrustedRuntimeScopeEntrypointGuardOptionsV1
): TrustedRuntimeScopeEntrypointGuardV1 {
  const bootstrap = captureTrustedBootstrapInput(options.process);
  const runtimeId = requireNonEmpty(options.runtimeId, "runtimeId") as RuntimeId;
  const traceId = requireNonEmpty(options.traceId, "traceId") as TraceId;
  return Object.freeze({
    bootstrap: createTrustedRuntimeScopeBootstrap({
      authorityDirectory: options.authorityDirectory,
      discovery: options.discovery,
      ...(options.registryFactory ? { registryFactory: options.registryFactory } : {}),
    }),
    request: Object.freeze({
      schemaVersion: TRUSTED_RUNTIME_BOOTSTRAP_VERSION,
      bootstrap,
      runtimeId,
      traceId,
    }),
  });
}

export function authorizeTrustedRuntimeEntrypoint(
  guard: TrustedRuntimeScopeEntrypointGuardV1,
  entrypoint: TrustedRuntimeEntrypoint,
  requestedCapabilities: readonly CapabilityId[],
  diagnosticRequest?: DiagnosticRequestV1
): Promise<TrustedRuntimeScopeBootstrapResultV1> {
  return guard.bootstrap.resolve({
    ...guard.request,
    entrypoint,
    requestedCapabilities: Object.freeze([...requestedCapabilities]),
    ...(diagnosticRequest ? { diagnosticRequest } : {}),
  });
}

function requireNonEmpty(value: string, name: string): string {
  if (value.trim().length === 0) throw new TypeError(`${name} cannot be empty.`);
  return value;
}

function timestamp(value: string, name: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO-compatible timestamp.`);
  }
  return value;
}

function normalizeDiscovery(value: RuntimeScopeDiscoveryV1): RuntimeScopeDiscoveryV1 {
  if (
    value.schemaVersion !== TRUSTED_RUNTIME_BOOTSTRAP_VERSION ||
    (value.authorityMode !== "shared" && value.authorityMode !== "local-offline")
  ) {
    throw new TypeError("Unsupported runtime discovery contract.");
  }
  const requestedWorkspace: WorkspaceSelectorV1 =
    "workspaceId" in value.requestedWorkspace
      ? Object.freeze({ workspaceId: value.requestedWorkspace.workspaceId })
      : Object.freeze({
          tenant:
            "tenantId" in value.requestedWorkspace.tenant
              ? Object.freeze({ tenantId: value.requestedWorkspace.tenant.tenantId })
              : Object.freeze({ tenantSlug: value.requestedWorkspace.tenant.tenantSlug }),
          workspaceSlug: value.requestedWorkspace.workspaceSlug,
        });
  const repositoryDeclaration = value.repositoryDeclaration
    ? Object.freeze({
        schemaVersion: value.repositoryDeclaration.schemaVersion,
        repositoryId: value.repositoryDeclaration.repositoryId,
        repositorySlug: value.repositoryDeclaration.repositorySlug,
        ...(value.repositoryDeclaration.preferredWorkspace
          ? {
              preferredWorkspace: Object.freeze({
                ...(value.repositoryDeclaration.preferredWorkspace.tenantSlug
                  ? { tenantSlug: value.repositoryDeclaration.preferredWorkspace.tenantSlug }
                  : {}),
                workspaceSlug: value.repositoryDeclaration.preferredWorkspace.workspaceSlug,
              }),
            }
          : {}),
      })
    : undefined;
  const repositoryEvidence = Object.freeze({
    ...value.repositoryEvidence,
    ...(value.repositoryEvidence.provider
      ? { provider: Object.freeze({ ...value.repositoryEvidence.provider }) }
      : {}),
  });
  return Object.freeze({
    schemaVersion: TRUSTED_RUNTIME_BOOTSTRAP_VERSION,
    projectRoot: requireNonEmpty(value.projectRoot, "projectRoot"),
    authenticationRef: requireNonEmpty(
      value.authenticationRef,
      "authenticationRef"
    ) as AuthenticationRef,
    requestedWorkspace,
    ...(repositoryDeclaration ? { repositoryDeclaration } : {}),
    repositoryEvidence,
    authorityMode: value.authorityMode,
    authoritySource: requireNonEmpty(value.authoritySource, "authoritySource"),
    authorityCacheExpiresAt: timestamp(value.authorityCacheExpiresAt, "authorityCacheExpiresAt"),
    ...(value.sourceRevision ? { sourceRevision: Object.freeze({ ...value.sourceRevision }) } : {}),
  });
}

function allowedEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Readonly<Record<string, string | undefined>> {
  const captured: Record<string, string> = {};
  for (const key of RUNTIME_SCOPE_COMPATIBILITY_ENVIRONMENT) {
    const value = environment[key];
    if (value !== undefined && value.trim().length > 0) captured[key] = value;
  }
  return Object.freeze(captured);
}

function normalizeBootstrapSnapshot(value: BootstrapInputSnapshotV1): BootstrapInputSnapshotV1 {
  if (
    value.schemaVersion !== RUNTIME_SCOPE_IMPLEMENTATION_VERSION ||
    value.executionSurface.schemaVersion !== LOCAL_BINDING_CONTRACT_VERSION
  ) {
    throw new TypeError("Unsupported trusted runtime bootstrap contract version.");
  }
  const executionSurface = Object.freeze({ ...value.executionSurface });
  return Object.freeze({
    schemaVersion: RUNTIME_SCOPE_IMPLEMENTATION_VERSION,
    cwd: normalizeExecutionSurfacePath(value.cwd, executionSurface, "cwd"),
    argv: Object.freeze(value.argv.map((argument) => requireNonEmpty(argument, "argv value"))),
    allowedEnvironment: allowedEnvironment(value.allowedEnvironment),
    platform: value.platform,
    executionSurface,
    capturedAt: timestamp(value.capturedAt, "capturedAt"),
  });
}

/**
 * Capture and freeze process facts once at a CLI or MCP trust boundary.
 *
 * The caller supplies the process-like values explicitly so tests and embedders
 * do not need to mutate globals. No value outside the compatibility allow-list
 * survives this boundary.
 */
export function captureTrustedBootstrapInput(
  input: TrustedProcessCaptureV1
): BootstrapInputSnapshotV1 {
  const environment = allowedEnvironment(input.environment);
  const executionSurface = detectExecutionSurface({
    platform: input.platform,
    installationRef: requireNonEmpty(input.installationRef, "installationRef"),
    wslDistribution: environment.WSL_DISTRO_NAME,
    launchOrigin:
      input.platform === "win32" && environment.WSL_INTEROP ? "wsl-interop" : "native-shell",
  });
  const cwd = normalizeExecutionSurfacePath(input.cwd, executionSurface, "cwd");

  return Object.freeze({
    schemaVersion: RUNTIME_SCOPE_IMPLEMENTATION_VERSION,
    cwd,
    argv: Object.freeze([...input.argv]),
    allowedEnvironment: environment,
    platform: input.platform,
    executionSurface,
    capturedAt: timestamp(input.capturedAt, "capturedAt"),
  });
}

/** Resolve the surface-local registry only from the frozen compatibility snapshot. */
export function registryLocationFromBootstrap(
  bootstrap: BootstrapInputSnapshotV1
): ResolvedRegistryLocationV1 {
  if (bootstrap.schemaVersion !== RUNTIME_SCOPE_IMPLEMENTATION_VERSION) {
    throw new TypeError(`Unsupported bootstrap schema: ${String(bootstrap.schemaVersion)}.`);
  }
  const environment = bootstrap.allowedEnvironment;
  return resolveLocalRegistryLocation({
    executionSurface: bootstrap.executionSurface,
    homeDirectory: environment.HOME ?? environment.USERPROFILE,
    localAppDataDirectory: environment.LOCALAPPDATA,
    xdgStateDirectory: environment.XDG_STATE_HOME,
  });
}

function defaultRegistryFactory(): RuntimeScopeRegistryFactoryV1 {
  return Object.freeze({
    openReadOnly(options: OpenLocalRegistryOptionsV1): RuntimeScopeRegistryHandleV1 {
      const registry = SqliteLocalBindingRegistry.open({ ...options, access: "read-only" });
      return Object.freeze({
        registry,
        close: () => registry.close(),
      });
    },
  });
}

function digest(value: string): ContentDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as ContentDigest;
}

function reference(value: string): string {
  return digest(value).slice(0, 23);
}

function stableResolutionDigest(
  request: TrustedRuntimeScopeBootstrapRequestV1,
  discovery: RuntimeScopeDiscoveryV1 | null,
  resolution: RuntimeScopeResolutionResultV1
): ContentDigest {
  const payload = resolution.resolved
    ? {
        entrypoint: request.entrypoint,
        result: "resolved",
        tenantId: resolution.authorizedScope.tenantId,
        workspaceId: resolution.authorizedScope.workspaceId,
        principalId: resolution.authorizedScope.principalId,
        capabilities: [...resolution.authorizedScope.capabilities].sort(),
        authorityDigest: resolution.authorizedScope.authorityDigest,
        repositoryId: resolution.invocationContext.binding?.repositoryId ?? null,
        authorityMode: discovery?.authorityMode ?? null,
      }
    : {
        entrypoint: request.entrypoint,
        result: "rejected",
        code: resolution.error.code,
        authorityMode: discovery?.authorityMode ?? null,
      };
  return digest(JSON.stringify(payload));
}

function requestedSections(request: DiagnosticRequestV1): ReadonlySet<DiagnosticSection> {
  return new Set(
    request.sections ?? ["configuration", "authority", "selection", "binding", "projection"]
  );
}

async function fullDiagnosticsAreAuthorized(
  authorityDirectory: AuthorityDirectory,
  resolution: RuntimeScopeResolutionResultV1
): Promise<boolean> {
  if (!resolution.resolved) return false;
  let decision: WorkspaceAuthorizationDecisionV1;
  try {
    decision = await authorityDirectory.authorizeWorkspace({
      principalId: resolution.authorizedScope.principalId,
      workspace: { workspaceId: resolution.authorizedScope.workspaceId },
      requestedCapabilities: [RUNTIME_DIAGNOSTIC_CAPABILITY],
    });
  } catch {
    return false;
  }
  return (
    decision.authorized &&
    decision.grant.tenantId === resolution.authorizedScope.tenantId &&
    decision.grant.workspaceId === resolution.authorizedScope.workspaceId &&
    decision.grant.principalId === resolution.authorizedScope.principalId &&
    decision.grant.capabilities.includes(RUNTIME_DIAGNOSTIC_CAPABILITY)
  );
}

async function diagnosticEnvelope(
  request: TrustedRuntimeScopeBootstrapRequestV1,
  discovery: RuntimeScopeDiscoveryV1 | null,
  resolution: RuntimeScopeResolutionResultV1,
  authorityDirectory: AuthorityDirectory
): Promise<DiagnosticEnvelopeV1 | undefined> {
  const diagnosticRequest = request.diagnosticRequest;
  if (!diagnosticRequest) return undefined;
  if (diagnosticRequest.schemaVersion !== DIAGNOSTIC_CONTRACT_VERSION) {
    return undefined;
  }

  const sections = requestedSections(diagnosticRequest);
  const mayViewFull =
    diagnosticRequest.level === "full" &&
    (await fullDiagnosticsAreAuthorized(authorityDirectory, resolution));
  const binding = resolution.resolved ? resolution.invocationContext.binding : undefined;
  const redactions = [];
  if (diagnosticRequest.level === "full" && !mayViewFull) {
    redactions.push(
      Object.freeze({
        field: "authority",
        reason: "capability-required" as const,
      }),
      Object.freeze({
        field: "binding",
        reason: "capability-required" as const,
      })
    );
  }
  redactions.push(
    Object.freeze({ field: "authenticationRef", reason: "secret" as const }),
    Object.freeze({ field: "projectRoot", reason: "topology" as const })
  );

  return Object.freeze({
    schemaVersion: DIAGNOSTIC_CONTRACT_VERSION,
    runtimeId: request.runtimeId,
    traceId: request.traceId,
    resolutionDigest: stableResolutionDigest(request, discovery, resolution),
    decisions: Object.freeze([
      resolution.resolved
        ? Object.freeze({
            code: "LEX_RUNTIME_SCOPE_RESOLVED",
            outcome: "accepted" as const,
            summary: "Trusted runtime scope resolved without changing registry state.",
          })
        : Object.freeze({
            code: resolution.error.code,
            outcome: "rejected" as const,
            summary: resolution.error.message,
          }),
    ]),
    warnings: Object.freeze(
      discovery?.authorityMode === "local-offline"
        ? [
            Object.freeze({
              code: "LEX_LOCAL_OFFLINE_AUTHORITY",
              summary:
                "Authority is bounded to this local execution surface and expiring cache evidence.",
            }),
          ]
        : []
    ),
    redactions: Object.freeze(redactions),
    ...(mayViewFull && resolution.resolved && discovery && sections.has("authority")
      ? {
          authority: Object.freeze({
            authoritySource: reference(discovery.authoritySource),
            authorityVersion: resolution.authorizedScope.authorityVersion,
            principalRef: reference(resolution.authorizedScope.principalId),
            tenantRef: reference(resolution.authorizedScope.tenantId),
            workspaceRef: reference(resolution.authorizedScope.workspaceId),
            capabilities: Object.freeze([...resolution.authorizedScope.capabilities].sort()),
          }),
        }
      : {}),
    ...(mayViewFull && binding && sections.has("binding")
      ? {
          binding: Object.freeze({
            bindingRef: reference(binding.bindingId),
            registryRef: reference(binding.registryInstanceId),
            executionSurfaceRef: reference(binding.executionSurfaceId),
            verification: "verified",
            evidenceRefs: Object.freeze([
              reference(binding.evidence.manifestDigest ?? "manifest:none"),
              reference(binding.evidence.gitCommonDirectoryDigest ?? "git-common:none"),
              reference(binding.evidence.filesystemEvidenceDigest ?? "filesystem:none"),
            ]),
          }),
        }
      : {}),
    ...(mayViewFull && resolution.resolved && sections.has("selection")
      ? {
          selection: Object.freeze({
            requestedRef: reference(JSON.stringify(discovery?.requestedWorkspace ?? {})),
            selectedRef: reference(resolution.authorizedScope.workspaceId),
            decisions: Object.freeze(["canonical-authority", "verified-local-binding"]),
          }),
        }
      : {}),
  });
}

function rejectedBootstrap(error: unknown): RuntimeScopeResolutionResultV1 {
  return runtimeScopeFailureFromRegistryError(error);
}

/**
 * Build the common CLI/MCP bootstrap. Normal resolution always opens the local
 * registry read-only and closes the handle before returning. Discovery and
 * canonical authority are injected; neither can be synthesized from env/cwd.
 */
export function createTrustedRuntimeScopeBootstrap(
  dependencies: TrustedRuntimeScopeBootstrapDependenciesV1
): TrustedRuntimeScopeBootstrapV1 {
  const registryFactory = dependencies.registryFactory ?? defaultRegistryFactory();

  return Object.freeze({
    async resolve(
      request: TrustedRuntimeScopeBootstrapRequestV1
    ): Promise<TrustedRuntimeScopeBootstrapResultV1> {
      let discovery: RuntimeScopeDiscoveryV1 | null = null;
      let resolution: RuntimeScopeResolutionResultV1;
      let handle: RuntimeScopeRegistryHandleV1 | null = null;

      try {
        if (request.schemaVersion !== TRUSTED_RUNTIME_BOOTSTRAP_VERSION) {
          throw new TypeError("Unsupported trusted runtime bootstrap contract version.");
        }
        const bootstrap = normalizeBootstrapSnapshot(request.bootstrap);
        requireNonEmpty(request.runtimeId, "runtimeId");
        requireNonEmpty(request.traceId, "traceId");
        discovery = normalizeDiscovery(
          await dependencies.discovery.discover({
            entrypoint: request.entrypoint,
            bootstrap,
          })
        );
        const registryLocation = registryLocationFromBootstrap(bootstrap);
        handle = registryFactory.openReadOnly({
          databasePath: registryLocation.registryPath,
          executionSurface: bootstrap.executionSurface,
          access: "read-only",
        });
        resolution = await resolveRuntimeScope(
          {
            schemaVersion: RUNTIME_SCOPE_IMPLEMENTATION_VERSION,
            bootstrap,
            projectRoot: discovery.projectRoot,
            authenticationRef: discovery.authenticationRef,
            requestedWorkspace: discovery.requestedWorkspace,
            requestedCapabilities: Object.freeze([...request.requestedCapabilities]),
            ...(discovery.repositoryDeclaration
              ? { repositoryDeclaration: discovery.repositoryDeclaration }
              : {}),
            repositoryEvidence: discovery.repositoryEvidence,
            runtimeSurface: {
              schemaVersion: LOCAL_BINDING_CONTRACT_VERSION,
              registryInstanceId: handle.registry.registryInstanceId,
              executionSurfaceId: handle.registry.executionSurfaceId,
              runtimeId: request.runtimeId,
            },
            authoritySource: requireNonEmpty(discovery.authoritySource, "authoritySource"),
            authorityCacheExpiresAt: timestamp(
              discovery.authorityCacheExpiresAt,
              "authorityCacheExpiresAt"
            ),
            ...(discovery.sourceRevision ? { sourceRevision: discovery.sourceRevision } : {}),
          },
          {
            authorityDirectory: dependencies.authorityDirectory,
            localRegistry: handle.registry,
          }
        );
      } catch (error) {
        resolution = rejectedBootstrap(error);
      } finally {
        try {
          handle?.close();
        } catch (error) {
          resolution = rejectedBootstrap(error);
        }
      }

      const diagnostics = await diagnosticEnvelope(
        request,
        discovery,
        resolution,
        dependencies.authorityDirectory
      );
      return resolution.resolved
        ? Object.freeze({
            resolved: true,
            invocationContext: resolution.invocationContext,
            authorizedScope: resolution.authorizedScope,
            ...(diagnostics ? { diagnostics } : {}),
          })
        : Object.freeze({
            resolved: false,
            error: resolution.error,
            ...(diagnostics ? { diagnostics } : {}),
          });
    },
  });
}
