import type {
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

export type RepositorySelectorV1 =
  { readonly repositoryId: RepositoryId } | { readonly repositorySlug: RepositorySlug };

export interface PrincipalResolutionRequestV1 {
  readonly authenticationRef: string;
}

export interface WorkspaceAuthorizationRequestV1 {
  readonly principalId: PrincipalId;
  readonly tenant: TenantSelectorV1;
  readonly workspace: WorkspaceSelectorV1;
  readonly requestedCapabilities: readonly CapabilityId[];
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

type LocalTopologyMethodName =
  "findRepositoryInstances" | "registerBinding" | "verifyBinding" | "revokeBinding";
type AssertNever<Value extends never> = Value;
type _AuthorityDirectoryCannotMutateLocalTopology = AssertNever<
  Extract<keyof AuthorityDirectory, LocalTopologyMethodName>
>;

export type PrincipalIdentity = PrincipalIdentityV1;
export type TenantRecord = TenantRecordV1;
export type WorkspaceRecord = WorkspaceRecordV1;
export type RepositoryRecord = RepositoryRecordV1;
export type AuthorizedWorkspaceGrant = AuthorizedWorkspaceGrantV1;
