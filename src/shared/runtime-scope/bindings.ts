import type { WorkspaceSelectorV1 } from "./authority.js";
import type {
  AuthorityVersion,
  BindingId,
  BindingReceiptId,
  ContentDigest,
  ExecutionSurfaceId,
  PrincipalId,
  RegistryInstanceId,
  RepositoryId,
  RepositoryInstanceId,
  RepositorySlug,
  RuntimeId,
  TenantId,
  TenantSlug,
  WorkspaceId,
  WorkspaceInstanceId,
  WorkspaceSlug,
} from "./ids.js";

export const LOCAL_BINDING_CONTRACT_VERSION = 1 as const;

export type NativePlatform = "win32" | "linux" | "darwin" | "other";
export type ExecutionSurfaceKind =
  "windows-native" | "wsl" | "linux-native" | "macos-native" | "other";
export type LaunchOrigin = "native-shell" | "wsl-interop" | "other" | "unknown";

export interface ExecutionSurfaceEvidenceV1 {
  readonly schemaVersion: typeof LOCAL_BINDING_CONTRACT_VERSION;
  readonly nativePlatform: NativePlatform;
  readonly kind: ExecutionSurfaceKind;
  readonly installationRef: string;
  readonly wslDistribution?: string;
  readonly launchOrigin?: LaunchOrigin;
  readonly evidenceDigest: ContentDigest;
}

export interface RuntimeSurfaceIdentityV1 {
  readonly schemaVersion: typeof LOCAL_BINDING_CONTRACT_VERSION;
  readonly executionSurfaceId: ExecutionSurfaceId;
  readonly registryInstanceId: RegistryInstanceId;
  readonly runtimeId: RuntimeId;
}

export interface PreferredWorkspaceHintV1 {
  readonly tenantSlug?: TenantSlug;
  readonly workspaceSlug: WorkspaceSlug;
}

/** An untrusted, checked-in repository identity claim. */
export interface RepositoryDeclarationV1 {
  readonly schemaVersion: typeof LOCAL_BINDING_CONTRACT_VERSION;
  readonly repositoryId: RepositoryId;
  readonly repositorySlug: RepositorySlug;
  readonly preferredWorkspace?: PreferredWorkspaceHintV1;
}

export interface ProviderRepositoryEvidenceV1 {
  readonly provider: string;
  readonly providerRepositoryId: string;
  readonly remoteDigest?: ContentDigest;
}

export interface RepositoryInstanceEvidenceV1 {
  readonly schemaVersion: typeof LOCAL_BINDING_CONTRACT_VERSION;
  readonly canonicalRoot: string;
  readonly manifestDigest: ContentDigest;
  readonly gitCommonDirectoryDigest?: ContentDigest;
  readonly filesystemEvidenceDigest?: ContentDigest;
  readonly provider?: ProviderRepositoryEvidenceV1;
}

/** A cache of a decision made by canonical authority, never a locally minted grant. */
export interface CachedAuthorityEvidenceV1 {
  readonly schemaVersion: typeof LOCAL_BINDING_CONTRACT_VERSION;
  readonly authoritySource: string;
  readonly authorityVersion: AuthorityVersion;
  readonly authorityDigest: ContentDigest;
  readonly verifiedAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
}

export type LocalBindingState = "active" | "revoked";

export interface RepositoryInstanceBindingV1 {
  readonly schemaVersion: typeof LOCAL_BINDING_CONTRACT_VERSION;
  readonly bindingId: BindingId;
  readonly registryInstanceId: RegistryInstanceId;
  readonly executionSurfaceId: ExecutionSurfaceId;
  readonly workspaceInstanceId: WorkspaceInstanceId;
  readonly repositoryInstanceId: RepositoryInstanceId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryId;
  readonly evidence: RepositoryInstanceEvidenceV1;
  readonly cachedAuthority?: CachedAuthorityEvidenceV1;
  readonly state: LocalBindingState;
  readonly createdAt: string;
  readonly lastVerifiedAt?: string;
  readonly revokedAt?: string;
}

export interface FindRepositoryInstancesRequestV1 {
  readonly projectRoot: string;
  readonly repositoryDeclaration: RepositoryDeclarationV1;
  readonly requestedWorkspace?: WorkspaceSelectorV1;
  readonly evidence: RepositoryInstanceEvidenceV1;
}

export interface RegisterBindingRequestV1 {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryId;
  readonly repositoryInstanceId: RepositoryInstanceId;
  readonly workspaceInstanceId: WorkspaceInstanceId;
  readonly evidence: RepositoryInstanceEvidenceV1;
  readonly authorityEvidence: CachedAuthorityEvidenceV1;
  readonly registeredByPrincipalId: PrincipalId;
}

export interface BindingReceiptV1 {
  readonly schemaVersion: typeof LOCAL_BINDING_CONTRACT_VERSION;
  readonly receiptId: BindingReceiptId;
  readonly bindingId: BindingId;
  readonly registryInstanceId: RegistryInstanceId;
  readonly executionSurfaceId: ExecutionSurfaceId;
  readonly repositoryInstanceId: RepositoryInstanceId;
  readonly workspaceInstanceId: WorkspaceInstanceId;
  readonly evidenceDigest: ContentDigest;
  readonly authorityDigest: ContentDigest;
  readonly registeredByPrincipalId: PrincipalId;
  readonly createdAt: string;
}

export interface VerifyBindingRequestV1 {
  readonly binding: RepositoryInstanceBindingV1;
  readonly declaration: RepositoryDeclarationV1;
  readonly evidence: RepositoryInstanceEvidenceV1;
  readonly authorityEvidence: CachedAuthorityEvidenceV1;
  readonly verifiedAt: string;
}

export type BindingVerificationStatus =
  "verified" | "mismatch" | "ambiguous" | "authority-expired" | "authority-revoked";

export interface BindingVerificationV1 {
  readonly schemaVersion: typeof LOCAL_BINDING_CONTRACT_VERSION;
  readonly status: BindingVerificationStatus;
  readonly bindingId?: BindingId;
  readonly evidenceDigest: ContentDigest;
  readonly authorityDigest?: ContentDigest;
  readonly verifiedAt: string;
  readonly reasons: readonly string[];
}

export interface RevokeBindingRequestV1 {
  readonly bindingId: BindingId;
  readonly revokedByPrincipalId: PrincipalId;
  readonly revokedAt: string;
  readonly reason: string;
}

/**
 * Native-environment-specific topology and evidence.
 *
 * This interface intentionally has no tenant-membership, workspace-grant, or
 * principal-authorization mutation methods. Canonical authority belongs to
 * AuthorityDirectory.
 */
export interface LocalBindingRegistry {
  readonly registryInstanceId: RegistryInstanceId;
  readonly executionSurfaceId: ExecutionSurfaceId;

  findRepositoryInstances(
    request: FindRepositoryInstancesRequestV1
  ): Promise<readonly RepositoryInstanceBindingV1[]>;
  registerBinding(request: RegisterBindingRequestV1): Promise<BindingReceiptV1>;
  verifyBinding(request: VerifyBindingRequestV1): Promise<BindingVerificationV1>;
  revokeBinding(request: RevokeBindingRequestV1): Promise<void>;
}

type AuthorityMintingMethodName =
  "grantWorkspaceAccess" | "addTenantMembership" | "authorizePrincipal";
type AssertNever<Value extends never> = Value;
type _LocalRegistryCannotMintAuthority = AssertNever<
  Extract<keyof LocalBindingRegistry, AuthorityMintingMethodName>
>;
type _LocalRegistrationContainsNoGrant = AssertNever<
  Extract<keyof RegisterBindingRequestV1, "authorizedGrant" | "capabilities">
>;

export type RuntimeSurfaceIdentity = RuntimeSurfaceIdentityV1;
export type RepositoryDeclaration = RepositoryDeclarationV1;
export type RepositoryInstanceEvidence = RepositoryInstanceEvidenceV1;
export type CachedAuthorityEvidence = CachedAuthorityEvidenceV1;
export type RepositoryInstanceBinding = RepositoryInstanceBindingV1;
export type BindingReceipt = BindingReceiptV1;
export type BindingVerification = BindingVerificationV1;
