import type {
  AuthenticationRef,
  AuthorityGrantId,
  AuthorityVersion,
  CapabilityId,
  ContentDigest,
  PrincipalId,
  RepositoryId,
  RepositorySlug,
  ScopeVersion,
  TenantId,
  TenantSlug,
  WorkspaceId,
  WorkspaceSlug,
} from "./ids.js";

export const AUTHORITY_DIRECTORY_CONTRACT_VERSION = 1 as const;

export type CanonicalRecordState = "active" | "revoked";

export interface PrincipalIdentityV1 {
  readonly schemaVersion: typeof AUTHORITY_DIRECTORY_CONTRACT_VERSION;
  readonly principalId: PrincipalId;
  readonly displayName?: string;
  readonly state: CanonicalRecordState;
  readonly authorityVersion: AuthorityVersion;
}

export interface TenantRecordV1 {
  readonly schemaVersion: typeof AUTHORITY_DIRECTORY_CONTRACT_VERSION;
  readonly tenantId: TenantId;
  readonly tenantSlug: TenantSlug;
  readonly displayName?: string;
  readonly state: CanonicalRecordState;
  readonly authorityVersion: AuthorityVersion;
}

export interface WorkspaceRecordV1 {
  readonly schemaVersion: typeof AUTHORITY_DIRECTORY_CONTRACT_VERSION;
  readonly workspaceId: WorkspaceId;
  readonly tenantId: TenantId;
  readonly workspaceSlug: WorkspaceSlug;
  readonly displayName?: string;
  readonly state: CanonicalRecordState;
  readonly authorityVersion: AuthorityVersion;
}

export interface RepositoryRecordV1 {
  readonly schemaVersion: typeof AUTHORITY_DIRECTORY_CONTRACT_VERSION;
  readonly repositoryId: RepositoryId;
  readonly repositorySlug: RepositorySlug;
  readonly displayName?: string;
  readonly state: CanonicalRecordState;
  readonly authorityVersion: AuthorityVersion;
}

export type TenantSelectorV1 =
  { readonly tenantId: TenantId } | { readonly tenantSlug: TenantSlug };

export type WorkspaceSelectorV1 =
  | { readonly workspaceId: WorkspaceId }
  | {
      readonly tenant: TenantSelectorV1;
      readonly workspaceSlug: WorkspaceSlug;
    };

/** Canonical repository lookup is ID-only; human slugs are untrusted display hints. */
export type RepositorySelectorV1 = { readonly repositoryId: RepositoryId };

export interface PrincipalResolutionRequestV1 {
  /**
   * Opaque handle to authentication state owned by the trusted entrypoint.
   * This value is never a credential and must not appear in diagnostics.
   */
  readonly authenticationRef: AuthenticationRef;
}

export interface WorkspaceAuthorizationRequestV1 {
  readonly principalId: PrincipalId;
  /** One coherent selector; authority resolves its canonical owning tenant. */
  readonly workspace: WorkspaceSelectorV1;
  readonly requestedCapabilities: readonly CapabilityId[];
}

export interface RepositoryAuthorizationRequestV1 {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryId;
}

export interface AuthorizedWorkspaceGrantV1 {
  readonly schemaVersion: typeof AUTHORITY_DIRECTORY_CONTRACT_VERSION;
  readonly grantId: AuthorityGrantId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly principalId: PrincipalId;
  readonly capabilities: readonly CapabilityId[];
  readonly authorityVersion: AuthorityVersion;
  readonly scopeVersion: ScopeVersion;
  readonly authorityDigest: ContentDigest;
  readonly verifiedAt: string;
  readonly expiresAt?: string;
}

export type WorkspaceAuthorizationDenialReason =
  | "principal-unknown"
  | "tenant-unknown"
  | "workspace-unknown"
  | "membership-missing"
  | "capability-missing"
  | "grant-expired"
  | "grant-revoked";

export type WorkspaceAuthorizationDecisionV1 =
  | {
      readonly authorized: true;
      readonly grant: AuthorizedWorkspaceGrantV1;
    }
  | {
      readonly authorized: false;
      readonly reason: WorkspaceAuthorizationDenialReason;
      readonly authorityVersion?: AuthorityVersion;
    };

/**
 * Canonical shared identity and authorization.
 *
 * Implementations may use PostgreSQL or a test double. This interface is kept
 * separate from LocalBindingRegistry so local topology cannot mint authority.
 */
export interface AuthorityDirectory {
  resolvePrincipal(request: PrincipalResolutionRequestV1): Promise<PrincipalIdentityV1 | null>;
  getTenant(selector: TenantSelectorV1): Promise<TenantRecordV1 | null>;
  getWorkspace(selector: WorkspaceSelectorV1): Promise<WorkspaceRecordV1 | null>;
  getRepository(selector: RepositorySelectorV1): Promise<RepositoryRecordV1 | null>;
  authorizeWorkspace(
    request: WorkspaceAuthorizationRequestV1
  ): Promise<WorkspaceAuthorizationDecisionV1>;
}

/**
 * Shared authorities can additionally constrain which canonical repositories
 * may provide provenance for one workspace. Kept as an explicit extension so
 * local/test embedders cannot accidentally pretend that a path is authority.
 */
export interface RepositoryScopedAuthorityDirectory extends AuthorityDirectory {
  authorizeRepository(request: RepositoryAuthorizationRequestV1): Promise<boolean>;
}

/**
 * A durable authority can pin every lookup made by one resolver invocation to
 * one immutable database snapshot. In-memory directories are already immutable.
 */
export interface ConsistentAuthorityDirectory extends AuthorityDirectory {
  withConsistentSnapshot<Result>(
    operation: (directory: AuthorityDirectory) => Promise<Result>
  ): Promise<Result>;
}

export function isRepositoryScopedAuthorityDirectory(
  directory: AuthorityDirectory
): directory is RepositoryScopedAuthorityDirectory {
  return "authorizeRepository" in directory && typeof directory.authorizeRepository === "function";
}

export function isConsistentAuthorityDirectory(
  directory: AuthorityDirectory
): directory is ConsistentAuthorityDirectory {
  return (
    "withConsistentSnapshot" in directory && typeof directory.withConsistentSnapshot === "function"
  );
}

type LocalTopologyMethodName =
  "findRepositoryInstances" | "registerBinding" | "verifyBinding" | "revokeBinding";
type AssertNever<Value extends never> = Value;
type _AuthorityDirectoryCannotMutateLocalTopology = AssertNever<
  Extract<keyof AuthorityDirectory, LocalTopologyMethodName>
>;
type _WorkspaceAuthorizationHasNoDuplicateTenantSelector = AssertNever<
  Extract<keyof WorkspaceAuthorizationRequestV1, "tenant">
>;
type _RepositoryLookupHasNoBareSlug = AssertNever<
  Extract<keyof RepositorySelectorV1, "repositorySlug">
>;

export type PrincipalIdentity = PrincipalIdentityV1;
export type TenantRecord = TenantRecordV1;
export type WorkspaceRecord = WorkspaceRecordV1;
export type RepositoryRecord = RepositoryRecordV1;
export type AuthorizedWorkspaceGrant = AuthorizedWorkspaceGrantV1;
