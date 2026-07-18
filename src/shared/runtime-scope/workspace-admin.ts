import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import type { AuthorityDirectory, AuthorizedWorkspaceGrantV1 } from "./authority.js";
import {
  LOCAL_BINDING_CONTRACT_VERSION,
  type BindingReceiptV1,
  type CachedAuthorityEvidenceV1,
  type RepositoryInstanceBindingV1,
} from "./bindings.js";
import { RUNTIME_OPERATION_CAPABILITIES } from "./capabilities.js";
import type {
  BindingId,
  ExecutionSurfaceId,
  PrincipalId,
  RegistryInstanceId,
  RepositoryId,
  RepositoryInstanceId,
  WorkspaceInstanceId,
} from "./ids.js";
import {
  LocalRegistryError,
  SqliteLocalBindingRegistry,
  type BindingLifecycleReceiptV1,
} from "./registry.js";
import type {
  RuntimeScopeDiscoveryAdapterV1,
  RuntimeScopeDiscoveryV1,
  TrustedRuntimeEntrypoint,
} from "./bootstrap.js";
import { registryLocationFromBootstrap } from "./bootstrap.js";
import type { BootstrapInputSnapshotV1 } from "./surface.js";

export const WORKSPACE_ADMIN_CONTRACT_VERSION = 1 as const;

export interface WorkspaceAdminInvocationV1 {
  readonly schemaVersion: typeof WORKSPACE_ADMIN_CONTRACT_VERSION;
  readonly entrypoint: TrustedRuntimeEntrypoint;
  readonly bootstrap: BootstrapInputSnapshotV1;
}

export interface WorkspaceBindRequestV1 extends WorkspaceAdminInvocationV1 {
  /** Required only when the repository has no checked-in declaration. */
  readonly repositoryId?: RepositoryId;
}

export interface WorkspaceBindingReferenceRequestV1 extends WorkspaceAdminInvocationV1 {
  readonly bindingId: BindingId;
  readonly reason: string;
}

export interface WorkspaceBindingInspectionV1 {
  readonly schemaVersion: typeof WORKSPACE_ADMIN_CONTRACT_VERSION;
  readonly registryInstanceId: RegistryInstanceId;
  readonly executionSurfaceId: ExecutionSurfaceId;
  readonly bindings: readonly RepositoryInstanceBindingV1[];
  readonly receipts: readonly BindingLifecycleReceiptV1[];
}

export interface WorkspaceRegistryRecoveryV1 {
  readonly schemaVersion: typeof WORKSPACE_ADMIN_CONTRACT_VERSION;
  readonly registryInstanceId: RegistryInstanceId;
  readonly executionSurfaceId: ExecutionSurfaceId;
  readonly created: true;
}

export interface WorkspaceBindingAdminServiceV1 {
  bind(request: WorkspaceBindRequestV1): Promise<BindingReceiptV1>;
  inspect(request: WorkspaceAdminInvocationV1): Promise<WorkspaceBindingInspectionV1>;
  rebind(request: WorkspaceBindingReferenceRequestV1): Promise<BindingLifecycleReceiptV1>;
  revoke(request: WorkspaceBindingReferenceRequestV1): Promise<void>;
  /** Explicitly recreate an absent, empty surface-local registry. Never repairs in place. */
  recover(request: WorkspaceAdminInvocationV1): Promise<WorkspaceRegistryRecoveryV1>;
}

export interface WorkspaceBindingAdminDependenciesV1 {
  readonly authorityDirectory: AuthorityDirectory;
  readonly discovery: RuntimeScopeDiscoveryAdapterV1;
  readonly now?: () => string;
  readonly newId?: () => string;
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} must be an ISO-compatible timestamp.`);
  return parsed;
}

function requireNonEmpty(value: string, name: string): string {
  if (value.trim().length === 0) throw new TypeError(`${name} cannot be empty.`);
  return value;
}

function assertInvocation(request: WorkspaceAdminInvocationV1): void {
  if (request.schemaVersion !== WORKSPACE_ADMIN_CONTRACT_VERSION) {
    throw new TypeError("Unsupported workspace administration contract version.");
  }
}

function effectiveExpiry(
  discovery: RuntimeScopeDiscoveryV1,
  grant: AuthorizedWorkspaceGrantV1,
  now: string
): string {
  const cacheExpiry = timestamp(discovery.authorityCacheExpiresAt, "authority cache expiry");
  const grantExpiry = grant.expiresAt
    ? timestamp(grant.expiresAt, "authority grant expiry")
    : Number.POSITIVE_INFINITY;
  const expiry = Math.min(cacheExpiry, grantExpiry);
  if (expiry <= timestamp(now, "administration time")) {
    throw new LocalRegistryError(
      "REGISTRY_INVALID_INPUT",
      "Authority evidence expires before this lifecycle operation can complete."
    );
  }
  return new Date(expiry).toISOString();
}

function cachedAuthority(
  discovery: RuntimeScopeDiscoveryV1,
  grant: AuthorizedWorkspaceGrantV1,
  now: string
): CachedAuthorityEvidenceV1 {
  return Object.freeze({
    schemaVersion: LOCAL_BINDING_CONTRACT_VERSION,
    authoritySource: discovery.authoritySource,
    authorityVersion: grant.authorityVersion,
    authorityDigest: grant.authorityDigest,
    verifiedAt: now,
    expiresAt: effectiveExpiry(discovery, grant, now),
  });
}

/**
 * Administrative lifecycle boundary. Normal bootstrap never calls this
 * service, and no method derives authority from local registry contents.
 */
export class WorkspaceBindingAdminService implements WorkspaceBindingAdminServiceV1 {
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(private readonly dependencies: WorkspaceBindingAdminDependenciesV1) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.newId = dependencies.newId ?? randomUUID;
  }

  async bind(request: WorkspaceBindRequestV1): Promise<BindingReceiptV1> {
    assertInvocation(request);
    const { discovery, principalId, grant } = await this.authorized(
      request,
      RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_BIND
    );
    const repositoryId = request.repositoryId ?? discovery.repositoryDeclaration?.repositoryId;
    if (!repositoryId) {
      throw new LocalRegistryError(
        "REGISTRY_INVALID_INPUT",
        "Binding requires --repository-id when lex.repository.json is absent."
      );
    }
    const repository = await this.dependencies.authorityDirectory.getRepository({ repositoryId });
    if (!repository || repository.state !== "active") {
      throw new LocalRegistryError(
        "REGISTRY_INVALID_INPUT",
        "Canonical authority did not recognize an active repository."
      );
    }
    if (
      discovery.repositoryDeclaration &&
      discovery.repositoryDeclaration.repositoryId !== repository.repositoryId
    ) {
      throw new LocalRegistryError(
        "REGISTRY_CONFLICT",
        "The requested repository conflicts with lex.repository.json."
      );
    }
    const at = this.now();
    const registry = this.openAdministrative(request.bootstrap);
    try {
      return await registry.registerBinding({
        tenantId: grant.tenantId,
        workspaceId: grant.workspaceId,
        repositoryId: repository.repositoryId,
        repositoryInstanceId: this.newId() as RepositoryInstanceId,
        workspaceInstanceId: this.newId() as WorkspaceInstanceId,
        evidence: discovery.repositoryEvidence,
        authorityEvidence: cachedAuthority(discovery, grant, at),
        registeredByPrincipalId: principalId,
      });
    } finally {
      registry.close();
    }
  }

  async inspect(request: WorkspaceAdminInvocationV1): Promise<WorkspaceBindingInspectionV1> {
    assertInvocation(request);
    const { grant } = await this.authorized(
      request,
      RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_INSPECT
    );
    const registry = this.openReadOnly(request.bootstrap);
    try {
      const bindings = (await registry.inspectBindings()).filter(
        (binding) =>
          binding.tenantId === grant.tenantId && binding.workspaceId === grant.workspaceId
      );
      const visibleBindingIds = new Set(bindings.map(({ bindingId }) => bindingId));
      const receipts = (await registry.inspectReceipts()).filter(({ bindingId }) =>
        visibleBindingIds.has(bindingId)
      );
      return Object.freeze({
        schemaVersion: WORKSPACE_ADMIN_CONTRACT_VERSION,
        registryInstanceId: registry.registryInstanceId,
        executionSurfaceId: registry.executionSurfaceId,
        bindings: Object.freeze(bindings),
        receipts: Object.freeze(receipts),
      });
    } finally {
      registry.close();
    }
  }

  async rebind(request: WorkspaceBindingReferenceRequestV1): Promise<BindingLifecycleReceiptV1> {
    assertInvocation(request);
    requireNonEmpty(request.bindingId, "bindingId");
    requireNonEmpty(request.reason, "reason");
    const { discovery, principalId, grant } = await this.authorized(
      request,
      RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_REBIND
    );
    const at = this.now();
    const registry = this.openAdministrative(request.bootstrap);
    try {
      const [binding] = await registry.inspectBindings({ bindingId: request.bindingId });
      if (
        !binding ||
        binding.tenantId !== grant.tenantId ||
        binding.workspaceId !== grant.workspaceId
      ) {
        throw new LocalRegistryError(
          "REGISTRY_INVALID_INPUT",
          "The binding is not owned by the authorized workspace."
        );
      }
      return await registry.rebindBinding({
        bindingId: request.bindingId,
        ...(discovery.repositoryDeclaration
          ? { declaration: discovery.repositoryDeclaration }
          : {}),
        evidence: discovery.repositoryEvidence,
        authorityEvidence: cachedAuthority(discovery, grant, at),
        reboundByPrincipalId: principalId,
        reboundAt: at,
        reason: request.reason,
      });
    } finally {
      registry.close();
    }
  }

  async revoke(request: WorkspaceBindingReferenceRequestV1): Promise<void> {
    assertInvocation(request);
    requireNonEmpty(request.bindingId, "bindingId");
    requireNonEmpty(request.reason, "reason");
    const { principalId, grant } = await this.authorized(
      request,
      RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_REVOKE
    );
    const registry = this.openAdministrative(request.bootstrap);
    try {
      const [binding] = await registry.inspectBindings({ bindingId: request.bindingId });
      if (
        !binding ||
        binding.tenantId !== grant.tenantId ||
        binding.workspaceId !== grant.workspaceId
      ) {
        throw new LocalRegistryError(
          "REGISTRY_INVALID_INPUT",
          "The binding is not owned by the authorized workspace."
        );
      }
      await registry.revokeBinding({
        bindingId: request.bindingId,
        revokedByPrincipalId: principalId,
        revokedAt: this.now(),
        reason: request.reason,
      });
    } finally {
      registry.close();
    }
  }

  async recover(request: WorkspaceAdminInvocationV1): Promise<WorkspaceRegistryRecoveryV1> {
    assertInvocation(request);
    await this.authorized(request, RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_RECOVER);
    const location = registryLocationFromBootstrap(request.bootstrap);
    if (existsSync(location.registryPath)) {
      throw new LocalRegistryError(
        "REGISTRY_CONFLICT",
        "Recovery refuses to replace or repair an existing registry in place."
      );
    }
    const registry = SqliteLocalBindingRegistry.initialize({
      databasePath: location.registryPath,
      registryInstanceId: this.newId() as RegistryInstanceId,
      executionSurfaceId: this.newId() as ExecutionSurfaceId,
      executionSurface: request.bootstrap.executionSurface,
      createdAt: this.now(),
    });
    try {
      return Object.freeze({
        schemaVersion: WORKSPACE_ADMIN_CONTRACT_VERSION,
        registryInstanceId: registry.registryInstanceId,
        executionSurfaceId: registry.executionSurfaceId,
        created: true,
      });
    } finally {
      registry.close();
    }
  }

  private async authorized(
    request: WorkspaceAdminInvocationV1,
    capability: (typeof RUNTIME_OPERATION_CAPABILITIES)[keyof typeof RUNTIME_OPERATION_CAPABILITIES]
  ): Promise<{
    readonly discovery: RuntimeScopeDiscoveryV1;
    readonly principalId: PrincipalId;
    readonly grant: AuthorizedWorkspaceGrantV1;
  }> {
    const discovery = await this.dependencies.discovery.discover({
      entrypoint: request.entrypoint,
      bootstrap: request.bootstrap,
    });
    const principal = await this.dependencies.authorityDirectory.resolvePrincipal({
      authenticationRef: discovery.authenticationRef,
    });
    if (!principal || principal.state !== "active") {
      throw new LocalRegistryError(
        "REGISTRY_INVALID_INPUT",
        "Canonical authority did not recognize an active principal."
      );
    }
    const decision = await this.dependencies.authorityDirectory.authorizeWorkspace({
      principalId: principal.principalId,
      workspace: discovery.requestedWorkspace,
      requestedCapabilities: [capability],
    });
    if (!decision.authorized || !decision.grant.capabilities.includes(capability)) {
      throw new LocalRegistryError(
        "REGISTRY_INVALID_INPUT",
        `Canonical authority denied ${capability}.`
      );
    }
    return { discovery, principalId: principal.principalId, grant: decision.grant };
  }

  private openReadOnly(bootstrap: BootstrapInputSnapshotV1): SqliteLocalBindingRegistry {
    const location = registryLocationFromBootstrap(bootstrap);
    return SqliteLocalBindingRegistry.open({
      databasePath: location.registryPath,
      executionSurface: bootstrap.executionSurface,
      access: "read-only",
    });
  }

  private openAdministrative(bootstrap: BootstrapInputSnapshotV1): SqliteLocalBindingRegistry {
    const location = registryLocationFromBootstrap(bootstrap);
    return SqliteLocalBindingRegistry.open({
      databasePath: location.registryPath,
      executionSurface: bootstrap.executionSurface,
      access: "administrative",
    });
  }
}
