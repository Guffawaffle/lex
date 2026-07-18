import {
  WORKSPACE_AUTHORITY_ERROR_CODES,
  type WorkspaceAuthorityErrorCode,
} from "../errors/error-codes.js";
import {
  AUTHORITY_DIRECTORY_CONTRACT_VERSION,
  type AuthorityDirectory,
  type AuthorizedWorkspaceGrantV1,
  type WorkspaceAuthorizationDenialReason,
  type WorkspaceSelectorV1,
} from "./authority.js";
import {
  LOCAL_BINDING_CONTRACT_VERSION,
  type BindingVerificationStatus,
  type CachedAuthorityEvidenceV1,
  type LocalBindingRegistry,
  type RepositoryDeclarationV1,
  type RepositoryInstanceBindingV1,
  type RepositoryInstanceEvidenceV1,
  type RuntimeSurfaceIdentityV1,
} from "./bindings.js";
import type { AuthenticationRef, CapabilityId } from "./ids.js";
import {
  RUNTIME_SCOPE_CONTRACT_VERSION,
  type AuthorizedScopeV1,
  type InvocationContextV1,
  type SourceRevisionEvidenceV1,
} from "./runtime.js";
import { LocalRegistryError } from "./registry.js";
import {
  executionSurfacePathsAreRelated,
  RUNTIME_SCOPE_IMPLEMENTATION_VERSION,
  nativePlatformFromNode,
  type BootstrapInputSnapshotV1,
} from "./surface.js";

export interface RuntimeScopeResolutionRequestV1 {
  readonly schemaVersion: typeof RUNTIME_SCOPE_IMPLEMENTATION_VERSION;
  readonly bootstrap: BootstrapInputSnapshotV1;
  readonly projectRoot: string;
  readonly authenticationRef: AuthenticationRef;
  readonly requestedWorkspace: WorkspaceSelectorV1;
  readonly requestedCapabilities: readonly CapabilityId[];
  readonly repositoryDeclaration?: RepositoryDeclarationV1;
  readonly repositoryEvidence: RepositoryInstanceEvidenceV1;
  readonly runtimeSurface: RuntimeSurfaceIdentityV1;
  readonly authoritySource: string;
  readonly authorityCacheExpiresAt: string;
  readonly sourceRevision?: SourceRevisionEvidenceV1;
}

export interface RuntimeScopeResolverDependenciesV1 {
  readonly authorityDirectory: AuthorityDirectory;
  readonly localRegistry: LocalBindingRegistry;
}

export interface RuntimeScopeResolutionErrorV1 {
  readonly code: WorkspaceAuthorityErrorCode;
  readonly message: string;
}

export type RuntimeScopeResolutionResultV1 =
  | {
      readonly resolved: true;
      readonly invocationContext: InvocationContextV1;
      readonly authorizedScope: AuthorizedScopeV1;
    }
  | {
      readonly resolved: false;
      readonly error: RuntimeScopeResolutionErrorV1;
    };

const ERROR_MESSAGES: Readonly<Record<WorkspaceAuthorityErrorCode, string>> = Object.freeze({
  [WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_UNBOUND]:
    "No trusted local workspace binding matched this invocation.",
  [WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH]:
    "Repository identity evidence did not match the trusted local binding.",
  [WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED]:
    "Canonical authority did not authorize the requested workspace selector.",
  [WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_BINDING_AMBIGUOUS]:
    "More than one trusted local binding matched without deterministic disambiguation.",
  [WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_CACHE_EXPIRED]:
    "Cached authority expired before the binding could be verified.",
  [WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_GRANT_REVOKED]:
    "Canonical authority revoked the workspace grant.",
});

function failure(code: WorkspaceAuthorityErrorCode): RuntimeScopeResolutionResultV1 {
  return Object.freeze({
    resolved: false,
    error: Object.freeze({ code, message: ERROR_MESSAGES[code] }),
  });
}

/** Translate local-registry bootstrap failures into the compact stable resolver vocabulary. */
export function runtimeScopeFailureFromRegistryError(
  error: unknown
): RuntimeScopeResolutionResultV1 {
  if (!(error instanceof LocalRegistryError)) {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH);
  }
  if (error.code === "REGISTRY_NOT_FOUND") {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_UNBOUND);
  }
  if (error.code === "REGISTRY_SURFACE_MISMATCH") {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED);
  }
  if (error.code === "REGISTRY_SCHEMA_INCOMPATIBLE") {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_UNBOUND);
  }
  return failure(WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH);
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasSchemaVersion(
  value: { readonly schemaVersion: number } | undefined,
  expected: number
): boolean {
  return value !== undefined && value.schemaVersion === expected;
}

function bindingVersionsAreSupported(binding: RepositoryInstanceBindingV1): boolean {
  return (
    hasSchemaVersion(binding, LOCAL_BINDING_CONTRACT_VERSION) &&
    hasSchemaVersion(binding.evidence, LOCAL_BINDING_CONTRACT_VERSION) &&
    (binding.cachedAuthority === undefined ||
      hasSchemaVersion(binding.cachedAuthority, LOCAL_BINDING_CONTRACT_VERSION))
  );
}

function requestRootsAreRelated(request: RuntimeScopeResolutionRequestV1): boolean {
  try {
    return executionSurfacePathsAreRelated(
      request.projectRoot,
      request.repositoryEvidence.canonicalRoot,
      request.bootstrap.executionSurface
    );
  } catch {
    return false;
  }
}

function bindingRootBelongsToRequest(
  binding: RepositoryInstanceBindingV1,
  request: RuntimeScopeResolutionRequestV1
): boolean {
  try {
    return executionSurfacePathsAreRelated(
      request.projectRoot,
      binding.evidence.canonicalRoot,
      request.bootstrap.executionSurface
    );
  } catch {
    return false;
  }
}

function denialCode(reason: WorkspaceAuthorizationDenialReason): WorkspaceAuthorityErrorCode {
  if (reason === "grant-revoked") {
    return WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_GRANT_REVOKED;
  }
  if (reason === "grant-expired") {
    return WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_CACHE_EXPIRED;
  }
  return WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED;
}

function workspaceSelector(selector: WorkspaceSelectorV1): WorkspaceSelectorV1 {
  return "workspaceId" in selector
    ? Object.freeze({ workspaceId: selector.workspaceId })
    : Object.freeze({
        tenant:
          "tenantId" in selector.tenant
            ? Object.freeze({ tenantId: selector.tenant.tenantId })
            : Object.freeze({ tenantSlug: selector.tenant.tenantSlug }),
        workspaceSlug: selector.workspaceSlug,
      });
}

function repositoryEvidence(evidence: RepositoryInstanceEvidenceV1): RepositoryInstanceEvidenceV1 {
  return Object.freeze({
    ...evidence,
    ...(evidence.provider ? { provider: Object.freeze({ ...evidence.provider }) } : {}),
  });
}

function repositoryDeclaration(declaration: RepositoryDeclarationV1): RepositoryDeclarationV1 {
  return Object.freeze({
    schemaVersion: declaration.schemaVersion,
    repositoryId: declaration.repositoryId,
    repositorySlug: declaration.repositorySlug,
    ...(declaration.preferredWorkspace
      ? {
          preferredWorkspace: Object.freeze({
            ...(declaration.preferredWorkspace.tenantSlug
              ? { tenantSlug: declaration.preferredWorkspace.tenantSlug }
              : {}),
            workspaceSlug: declaration.preferredWorkspace.workspaceSlug,
          }),
        }
      : {}),
  });
}

function repositoryBinding(binding: RepositoryInstanceBindingV1): RepositoryInstanceBindingV1 {
  return Object.freeze({
    schemaVersion: binding.schemaVersion,
    bindingId: binding.bindingId,
    registryInstanceId: binding.registryInstanceId,
    executionSurfaceId: binding.executionSurfaceId,
    workspaceInstanceId: binding.workspaceInstanceId,
    repositoryInstanceId: binding.repositoryInstanceId,
    tenantId: binding.tenantId,
    workspaceId: binding.workspaceId,
    repositoryId: binding.repositoryId,
    evidence: repositoryEvidence(binding.evidence),
    ...(binding.cachedAuthority
      ? { cachedAuthority: Object.freeze({ ...binding.cachedAuthority }) }
      : {}),
    state: binding.state,
    createdAt: binding.createdAt,
    ...(binding.lastVerifiedAt ? { lastVerifiedAt: binding.lastVerifiedAt } : {}),
    ...(binding.revokedAt ? { revokedAt: binding.revokedAt } : {}),
  });
}

function cacheEvidence(
  grant: AuthorizedWorkspaceGrantV1,
  request: RuntimeScopeResolutionRequestV1
): CachedAuthorityEvidenceV1 | null {
  const current = timestamp(request.bootstrap.capturedAt);
  const requestedExpiry = timestamp(request.authorityCacheExpiresAt);
  const grantExpiry = grant.expiresAt ? timestamp(grant.expiresAt) : null;
  if (
    current === null ||
    requestedExpiry === null ||
    requestedExpiry <= current ||
    (grant.expiresAt !== undefined && grantExpiry === null) ||
    (grantExpiry !== null && grantExpiry <= current)
  ) {
    return null;
  }
  const expiresAt =
    grantExpiry !== null && grantExpiry < requestedExpiry
      ? grant.expiresAt!
      : request.authorityCacheExpiresAt;
  return Object.freeze({
    schemaVersion: LOCAL_BINDING_CONTRACT_VERSION,
    authoritySource: request.authoritySource,
    authorityVersion: grant.authorityVersion,
    authorityDigest: grant.authorityDigest,
    verifiedAt: grant.verifiedAt,
    expiresAt,
  });
}

function authorizedScope(
  grant: AuthorizedWorkspaceGrantV1,
  requestedCapabilities: readonly CapabilityId[]
): AuthorizedScopeV1 {
  return Object.freeze({
    schemaVersion: RUNTIME_SCOPE_CONTRACT_VERSION,
    grantId: grant.grantId,
    tenantId: grant.tenantId,
    workspaceId: grant.workspaceId,
    principalId: grant.principalId,
    capabilities: Object.freeze([...new Set(requestedCapabilities)]),
    authorityVersion: grant.authorityVersion,
    scopeVersion: grant.scopeVersion,
    authorityDigest: grant.authorityDigest,
    verifiedAt: grant.verifiedAt,
    ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
  });
}

function invocationContext(
  request: RuntimeScopeResolutionRequestV1,
  binding: RepositoryInstanceBindingV1
): InvocationContextV1 {
  return Object.freeze({
    schemaVersion: RUNTIME_SCOPE_CONTRACT_VERSION,
    projectRoot: request.projectRoot,
    requestedWorkspace: workspaceSelector(request.requestedWorkspace),
    ...(request.repositoryDeclaration
      ? { repositoryDeclaration: repositoryDeclaration(request.repositoryDeclaration) }
      : {}),
    repositoryEvidence: repositoryEvidence(request.repositoryEvidence),
    binding: repositoryBinding(binding),
    runtimeSurface: Object.freeze({ ...request.runtimeSurface }),
    ...(request.sourceRevision
      ? { sourceRevision: Object.freeze({ ...request.sourceRevision }) }
      : {}),
  });
}

/**
 * Resolve one immutable runtime scope from captured input and injected state.
 * This function never reads process.env, cwd, platform globals, or databases
 * other than through its AuthorityDirectory and LocalBindingRegistry inputs.
 */
export async function resolveRuntimeScope(
  request: RuntimeScopeResolutionRequestV1,
  dependencies: RuntimeScopeResolverDependenciesV1
): Promise<RuntimeScopeResolutionResultV1> {
  if (
    request.schemaVersion !== RUNTIME_SCOPE_IMPLEMENTATION_VERSION ||
    request.bootstrap.schemaVersion !== RUNTIME_SCOPE_IMPLEMENTATION_VERSION ||
    !hasSchemaVersion(request.bootstrap.executionSurface, LOCAL_BINDING_CONTRACT_VERSION) ||
    !hasSchemaVersion(request.repositoryEvidence, LOCAL_BINDING_CONTRACT_VERSION) ||
    (request.repositoryDeclaration !== undefined &&
      !hasSchemaVersion(request.repositoryDeclaration, LOCAL_BINDING_CONTRACT_VERSION)) ||
    !hasSchemaVersion(request.runtimeSurface, LOCAL_BINDING_CONTRACT_VERSION) ||
    request.bootstrap.executionSurface.nativePlatform !==
      nativePlatformFromNode(request.bootstrap.platform) ||
    request.projectRoot.trim().length === 0 ||
    !requestRootsAreRelated(request) ||
    request.authoritySource.trim().length === 0 ||
    request.runtimeSurface.registryInstanceId !== dependencies.localRegistry.registryInstanceId ||
    request.runtimeSurface.executionSurfaceId !== dependencies.localRegistry.executionSurfaceId
  ) {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH);
  }

  let principal;
  try {
    principal = await dependencies.authorityDirectory.resolvePrincipal({
      authenticationRef: request.authenticationRef,
    });
  } catch {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED);
  }
  if (
    !principal ||
    !hasSchemaVersion(principal, AUTHORITY_DIRECTORY_CONTRACT_VERSION) ||
    principal.state !== "active"
  ) {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED);
  }

  let decision;
  try {
    decision = await dependencies.authorityDirectory.authorizeWorkspace({
      principalId: principal.principalId,
      workspace: request.requestedWorkspace,
      requestedCapabilities: request.requestedCapabilities,
    });
  } catch {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED);
  }
  if (!decision.authorized) return failure(denialCode(decision.reason));
  if (
    !hasSchemaVersion(decision.grant, AUTHORITY_DIRECTORY_CONTRACT_VERSION) ||
    !request.requestedCapabilities.every((capability) =>
      decision.grant.capabilities.includes(capability)
    )
  ) {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED);
  }

  const authorityEvidence = cacheEvidence(decision.grant, request);
  if (!authorityEvidence) {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_CACHE_EXPIRED);
  }

  if (request.repositoryDeclaration) {
    let declaredRepository;
    try {
      declaredRepository = await dependencies.authorityDirectory.getRepository({
        repositoryId: request.repositoryDeclaration.repositoryId,
      });
    } catch {
      return failure(WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH);
    }
    if (
      !declaredRepository ||
      !hasSchemaVersion(declaredRepository, AUTHORITY_DIRECTORY_CONTRACT_VERSION) ||
      declaredRepository.state !== "active"
    ) {
      return failure(WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH);
    }
  }

  let candidates;
  try {
    candidates = await dependencies.localRegistry.findRepositoryInstances({
      projectRoot: request.projectRoot,
      repositoryDeclaration: request.repositoryDeclaration,
      requestedWorkspace: request.requestedWorkspace,
      evidence: request.repositoryEvidence,
    });
  } catch (error) {
    return runtimeScopeFailureFromRegistryError(error);
  }
  const scopedCandidates = candidates.filter(
    (candidate) =>
      candidate.tenantId === decision.grant.tenantId &&
      candidate.workspaceId === decision.grant.workspaceId
  );
  if (scopedCandidates.length === 0) {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_UNBOUND);
  }

  const verified: RepositoryInstanceBindingV1[] = [];
  const statuses: BindingVerificationStatus[] = [];
  for (const candidate of scopedCandidates) {
    if (
      !bindingVersionsAreSupported(candidate) ||
      !bindingRootBelongsToRequest(candidate, request)
    ) {
      statuses.push("mismatch");
      continue;
    }
    let repository;
    try {
      repository = await dependencies.authorityDirectory.getRepository({
        repositoryId: candidate.repositoryId,
      });
    } catch {
      statuses.push("mismatch");
      continue;
    }
    if (
      !repository ||
      !hasSchemaVersion(repository, AUTHORITY_DIRECTORY_CONTRACT_VERSION) ||
      repository.state !== "active"
    ) {
      statuses.push("mismatch");
      continue;
    }
    let verification;
    try {
      verification = await dependencies.localRegistry.verifyBinding({
        binding: candidate,
        declaration: request.repositoryDeclaration,
        evidence: request.repositoryEvidence,
        authorityEvidence,
        verifiedAt: request.bootstrap.capturedAt,
      });
    } catch (error) {
      return runtimeScopeFailureFromRegistryError(error);
    }
    if (!hasSchemaVersion(verification, LOCAL_BINDING_CONTRACT_VERSION)) {
      statuses.push("mismatch");
      continue;
    }
    statuses.push(verification.status);
    if (verification.status === "verified") verified.push(candidate);
  }

  if (verified.length > 1) {
    return failure(WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_BINDING_AMBIGUOUS);
  }
  if (verified.length === 0) {
    if (statuses.includes("authority-revoked")) {
      return failure(WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_GRANT_REVOKED);
    }
    if (statuses.includes("authority-expired")) {
      return failure(WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_CACHE_EXPIRED);
    }
    return failure(
      scopedCandidates.length > 1
        ? WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_BINDING_AMBIGUOUS
        : WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH
    );
  }

  const binding = verified[0]!;
  return Object.freeze({
    resolved: true,
    invocationContext: invocationContext(request, binding),
    authorizedScope: authorizedScope(decision.grant, request.requestedCapabilities),
  });
}

export type RuntimeScopeResolutionRequest = RuntimeScopeResolutionRequestV1;
export type RuntimeScopeResolutionResult = RuntimeScopeResolutionResultV1;
