import { RUNTIME_DIAGNOSTIC_CAPABILITY } from "./bootstrap.js";
import { RUNTIME_OPERATION_CAPABILITIES } from "./capabilities.js";
import type {
  AuthenticationRef,
  AuthorityGrantId,
  AuthorityVersion,
  PrincipalId,
  RepositoryId,
  ScopeVersion,
  TenantId,
  WorkspaceId,
} from "./ids.js";
import {
  POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION,
  type PostgresAuthorityTopologyV1,
} from "./postgres-authority-admin.js";

const PRINCIPAL_ID = "10000000-0000-4000-8000-000000000001" as PrincipalId;
const AUTHORITY_VERSION = "dogfood-authority-v1" as AuthorityVersion;
const GRANT_VERSION = "dogfood-grant-v1";
const SCOPE_VERSION = "dogfood-scope-v1" as ScopeVersion;

const TENANTS = Object.freeze({
  platform: "20000000-0000-4000-8000-000000000001" as TenantId,
  stfc: "20000000-0000-4000-8000-000000000002" as TenantId,
});

const WORKSPACES = Object.freeze({
  lex: "30000000-0000-4000-8000-000000000001" as WorkspaceId,
  axf: "30000000-0000-4000-8000-000000000002" as WorkspaceId,
  stfcMod: "30000000-0000-4000-8000-000000000003" as WorkspaceId,
  stfcCompanion: "30000000-0000-4000-8000-000000000004" as WorkspaceId,
  majelDev: "30000000-0000-4000-8000-000000000005" as WorkspaceId,
});

const REPOSITORIES = Object.freeze({
  lex: "40000000-0000-4000-8000-000000000001" as RepositoryId,
  axf: "40000000-0000-4000-8000-000000000002" as RepositoryId,
  stfcMod: "40000000-0000-4000-8000-000000000003" as RepositoryId,
  stfcCompanion: "40000000-0000-4000-8000-000000000004" as RepositoryId,
  majel: "40000000-0000-4000-8000-000000000005" as RepositoryId,
});

const CAPABILITIES = Object.freeze([
  RUNTIME_OPERATION_CAPABILITIES.FRAME_READ,
  RUNTIME_OPERATION_CAPABILITIES.FRAME_WRITE,
  RUNTIME_OPERATION_CAPABILITIES.FRAME_DELETE,
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_BIND,
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_INSPECT,
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_REBIND,
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_REVOKE,
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_RECOVER,
  RUNTIME_DIAGNOSTIC_CAPABILITY,
]);

/**
 * Explicit dogfood administration input. The caller supplies an opaque
 * authentication handle; no credential or environment value is embedded.
 */
export function createLex3DogfoodAuthorityTopology(
  authenticationRef: AuthenticationRef
): PostgresAuthorityTopologyV1 {
  const workspaces = [
    [WORKSPACES.lex, TENANTS.platform, "lex", "Lex"],
    [WORKSPACES.axf, TENANTS.platform, "axf", "AXF"],
    [WORKSPACES.stfcMod, TENANTS.stfc, "stfc-mod", "STFC Mod"],
    [WORKSPACES.stfcCompanion, TENANTS.stfc, "stfc-companion", "STFC Companion"],
    [WORKSPACES.majelDev, TENANTS.stfc, "majel-dev", "Majel Development"],
  ] as const;
  const repositories = [
    [REPOSITORIES.lex, "lex", "Lex"],
    [REPOSITORIES.axf, "axf", "AXF"],
    [REPOSITORIES.stfcMod, "stfc-mod", "STFC Mod"],
    [REPOSITORIES.stfcCompanion, "stfc-mod-sidecar", "STFC Mod Sidecar"],
    [REPOSITORIES.majel, "majel", "Majel"],
  ] as const;
  const associations = [
    [TENANTS.platform, WORKSPACES.lex, REPOSITORIES.lex],
    [TENANTS.platform, WORKSPACES.axf, REPOSITORIES.axf],
    [TENANTS.stfc, WORKSPACES.stfcMod, REPOSITORIES.stfcMod],
    [TENANTS.stfc, WORKSPACES.stfcCompanion, REPOSITORIES.stfcCompanion],
    [TENANTS.stfc, WORKSPACES.majelDev, REPOSITORIES.majel],
  ] as const;

  return Object.freeze({
    schemaVersion: POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION,
    topologyId: "lex-3-two-tenant-five-workspace-dogfood-v1",
    principals: Object.freeze([
      Object.freeze({
        principalId: PRINCIPAL_ID,
        displayName: "guff",
        authorityVersion: AUTHORITY_VERSION,
      }),
    ]),
    authentication: Object.freeze([
      Object.freeze({
        authenticationRef,
        principalId: PRINCIPAL_ID,
        authorityVersion: AUTHORITY_VERSION,
      }),
    ]),
    tenants: Object.freeze([
      Object.freeze({
        tenantId: TENANTS.platform,
        tenantSlug: "platform-dogfood",
        displayName: "Platform Dogfood",
        authorityVersion: AUTHORITY_VERSION,
      }),
      Object.freeze({
        tenantId: TENANTS.stfc,
        tenantSlug: "stfc-dogfood",
        displayName: "STFC Dogfood",
        authorityVersion: AUTHORITY_VERSION,
      }),
    ]),
    workspaces: Object.freeze(
      workspaces.map(([workspaceId, tenantId, workspaceSlug, displayName]) =>
        Object.freeze({
          workspaceId,
          tenantId,
          workspaceSlug,
          displayName,
          authorityVersion: AUTHORITY_VERSION,
        })
      )
    ),
    repositories: Object.freeze(
      repositories.map(([repositoryId, repositorySlug, displayName]) =>
        Object.freeze({
          repositoryId,
          repositorySlug,
          displayName,
          authorityVersion: AUTHORITY_VERSION,
        })
      )
    ),
    workspaceRepositories: Object.freeze(
      associations.map(([tenantId, workspaceId, repositoryId]) =>
        Object.freeze({ tenantId, workspaceId, repositoryId, authorityVersion: AUTHORITY_VERSION })
      )
    ),
    memberships: Object.freeze([
      Object.freeze({
        tenantId: TENANTS.platform,
        principalId: PRINCIPAL_ID,
        authorityVersion: AUTHORITY_VERSION,
      }),
      Object.freeze({
        tenantId: TENANTS.stfc,
        principalId: PRINCIPAL_ID,
        authorityVersion: AUTHORITY_VERSION,
      }),
    ]),
    grants: Object.freeze(
      workspaces.map(([workspaceId, tenantId], index) =>
        Object.freeze({
          grantId:
            `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` as AuthorityGrantId,
          tenantId,
          workspaceId,
          principalId: PRINCIPAL_ID,
          capabilities: CAPABILITIES,
          authorityVersion: AUTHORITY_VERSION,
          grantVersion: GRANT_VERSION,
          scopeVersion: SCOPE_VERSION,
        })
      )
    ),
  });
}

export const LEX3_DOGFOOD_CANONICAL_IDS = Object.freeze({
  principalId: PRINCIPAL_ID,
  tenants: TENANTS,
  workspaces: WORKSPACES,
  repositories: REPOSITORIES,
});
