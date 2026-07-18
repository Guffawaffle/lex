import type { WorkspaceSelectorV1 } from "./authority.js";
import type {
  RepositoryDeclarationV1,
  RepositoryInstanceBindingV1,
  RepositoryInstanceEvidenceV1,
  RuntimeSurfaceIdentityV1,
} from "./bindings.js";
import type {
  AuthorityGrantId,
  AuthorityVersion,
  CapabilityId,
  ContentDigest,
  PrincipalId,
  RepositoryId,
  ScopeVersion,
  SecretHandleRef,
  TenantId,
  WorkspaceId,
} from "./ids.js";

export const RUNTIME_SCOPE_CONTRACT_VERSION = 1 as const;

export type ConfigurationSourceKind =
  | "cli"
  | "project-manifest"
  | "local-registry"
  | "authority-directory"
  | "compatibility-environment"
  | "default";

export interface ConfigurationSourceEvidenceV1 {
  readonly source: ConfigurationSourceKind;
  readonly key: string;
  readonly valueDigest?: ContentDigest;
  readonly redacted: boolean;
}

export type StoreBackendConfigurationV1 =
  | { readonly kind: "memory" }
  | { readonly kind: "sqlite"; readonly databasePath: string }
  | { readonly kind: "postgres"; readonly connectionRef: SecretHandleRef };

export interface ModuleRefV1 {
  readonly repositoryId: RepositoryId;
  readonly moduleId: string;
}

export interface ResolvedRuntimeConfigV1 {
  readonly schemaVersion: typeof RUNTIME_SCOPE_CONTRACT_VERSION;
  readonly backend: StoreBackendConfigurationV1;
  readonly configurationDigest: ContentDigest;
  readonly policyDigest?: ContentDigest;
  readonly modules: readonly ModuleRefV1[];
  readonly sources: readonly ConfigurationSourceEvidenceV1[];
}

export interface SourceRevisionEvidenceV1 {
  readonly branch?: string;
  readonly commitSha?: string;
  readonly workingTreeDigest?: ContentDigest;
}

export interface InvocationContextV1 {
  readonly schemaVersion: typeof RUNTIME_SCOPE_CONTRACT_VERSION;
  readonly projectRoot: string;
  readonly requestedWorkspace: WorkspaceSelectorV1;
  readonly repositoryDeclaration: RepositoryDeclarationV1;
  readonly repositoryEvidence: RepositoryInstanceEvidenceV1;
  readonly binding?: RepositoryInstanceBindingV1;
  readonly runtimeSurface: RuntimeSurfaceIdentityV1;
  readonly sourceRevision?: SourceRevisionEvidenceV1;
}

/** The single active tenant/workspace authority minted for one invocation. */
export interface AuthorizedScopeV1 {
  readonly schemaVersion: typeof RUNTIME_SCOPE_CONTRACT_VERSION;
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

type AuthorityFieldName =
  "tenantId" | "workspaceId" | "principalId" | "capabilities" | "authorityVersion";
type AssertNever<Value extends never> = Value;
type _ResolvedConfigContainsNoAuthority = AssertNever<
  Extract<keyof ResolvedRuntimeConfigV1, AuthorityFieldName>
>;

export type ResolvedRuntimeConfig = ResolvedRuntimeConfigV1;
export type InvocationContext = InvocationContextV1;
export type AuthorizedScope = AuthorizedScopeV1;
